use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, TokenAccount, Mint, Transfer, MintTo},
};

use crate::{
    AppFactory, AppRegistration, UserAppAccess, AppFactoryError,
    APP_REGISTRATION_SEED,
};

// Split purchase into pre-validation and execution
pub fn purchase_app_pre_validation(
    app_registration: &Account<AppRegistration>,
    app_factory: &Account<AppFactory>,
    price: &mut u64,
    platform_fee: &mut u64,
    creator_amount: &mut u64,
) -> Result<()> {
    // Validate purchase
    require!(app_registration.is_active, AppFactoryError::AppNotActive);
    require!(
        app_registration.current_supply < app_registration.max_supply,
        AppFactoryError::MaxSupplyReached
    );

    *price = app_registration.price;
    
    // Calculate splits
    *platform_fee = (*price)
        .checked_mul(app_factory.platform_fee_bps as u64)
        .ok_or(AppFactoryError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AppFactoryError::MathOverflow)?;
    
    *creator_amount = (*price)
        .checked_sub(*platform_fee)
        .ok_or(AppFactoryError::MathOverflow)?;

    Ok(())
}

// Separate token transfer logic
pub fn execute_token_transfers<'info>(
    user: &Signer<'info>,
    user_defai_ata: &Account<'info, TokenAccount>,
    creator_defai_ata: &Account<'info, TokenAccount>,
    treasury_defai_ata: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    platform_fee: u64,
    creator_amount: u64,
) -> Result<()> {
    // Transfer platform fee
    let platform_transfer_ctx = CpiContext::new(
        token_program.to_account_info(),
        Transfer {
            from: user_defai_ata.to_account_info(),
            to: treasury_defai_ata.to_account_info(),
            authority: user.to_account_info(),
        },
    );
    token::transfer(platform_transfer_ctx, platform_fee)?;

    // Transfer creator amount
    let creator_transfer_ctx = CpiContext::new(
        token_program.to_account_info(),
        Transfer {
            from: user_defai_ata.to_account_info(),
            to: creator_defai_ata.to_account_info(),
            authority: user.to_account_info(),
        },
    );
    token::transfer(creator_transfer_ctx, creator_amount)?;

    Ok(())
}

// Separate SFT minting logic
pub fn mint_app_sft<'info>(
    app_registration: &Account<'info, AppRegistration>,
    sft_mint: &AccountInfo<'info>,
    user_sft_ata: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    app_id: u64,
    bump: u8,
) -> Result<()> {
    let mint_seeds = &[
        APP_REGISTRATION_SEED,
        &app_id.to_le_bytes(),
        &[bump],
    ];
    let signer_seeds = &[&mint_seeds[..]];

    let mint_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        MintTo {
            mint: sft_mint.clone(),
            to: user_sft_ata.clone(),
            authority: app_registration.to_account_info(),
        },
        signer_seeds,
    );
    token::mint_to(mint_ctx, 1)?;

    Ok(())
}

// Optimized context with required accounts only
#[derive(Accounts)]
#[instruction(app_id: u64)]
pub struct PurchaseAppAccessOptimized<'info> {
    #[account(
        seeds = [b"app_factory"],
        bump
    )]
    pub app_factory: Box<Account<'info, AppFactory>>,
    
    #[account(
        mut,
        seeds = [b"app_registration".as_ref(), &app_id.to_le_bytes()],
        bump
    )]
    pub app_registration: Box<Account<'info, AppRegistration>>,
    
    #[account(
        init,
        payer = user,
        space = UserAppAccess::LEN,
        seeds = [b"user_app_access".as_ref(), user.key().as_ref(), &app_id.to_le_bytes()],
        bump
    )]
    pub user_app_access: Box<Account<'info, UserAppAccess>>,
    
    #[account(
        mut,
        address = app_registration.sft_mint
    )]
    pub sft_mint: Box<Account<'info, Mint>>,
    
    // Validate user's SFT ATA
    #[account(
        mut,
        associated_token::mint = sft_mint,
        associated_token::authority = user
    )]
    pub user_sft_ata: Box<Account<'info, TokenAccount>>,
    
    // Validate user's DEFAI ATA
    #[account(
        mut,
        associated_token::mint = defai_mint,
        associated_token::authority = user,
        constraint = user_defai_ata.amount >= app_registration.price 
            @ AppFactoryError::InsufficientBalance
    )]
    pub user_defai_ata: Box<Account<'info, TokenAccount>>,
    
    // Validate creator's DEFAI ATA
    #[account(
        mut,
        associated_token::mint = defai_mint,
        associated_token::authority = app_registration.creator
    )]
    pub creator_defai_ata: Box<Account<'info, TokenAccount>>,
    
    // Validate treasury's DEFAI ATA
    #[account(
        mut,
        associated_token::mint = defai_mint,
        associated_token::authority = app_factory.treasury
    )]
    pub treasury_defai_ata: Box<Account<'info, TokenAccount>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        constraint = defai_mint.key() == app_factory.defai_mint 
            @ AppFactoryError::InvalidDefaiMint
    )]
    pub defai_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// Separate, lightweight initializer to create all needed ATAs via associated token program
#[derive(Accounts)]
#[instruction(app_id: u64)]
pub struct PreparePurchaseAccounts<'info> {
    #[account(
        seeds = [b"app_factory"],
        bump
    )]
    pub app_factory: Box<Account<'info, AppFactory>>,
    
    #[account(
        mut,
        seeds = [b"app_registration".as_ref(), &app_id.to_le_bytes()],
        bump
    )]
    pub app_registration: Box<Account<'info, AppRegistration>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: DEFAI mint to bind ATAs
    #[account(constraint = defai_mint.key() == app_factory.defai_mint @ AppFactoryError::InvalidDefaiMint)]
    pub defai_mint: AccountInfo<'info>,
    
    /// CHECK: Creator must match registration
    #[account(address = app_registration.creator)]
    pub creator: AccountInfo<'info>,
    
    /// CHECK: Treasury must match factory
    #[account(address = app_factory.treasury)]
    pub treasury: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = defai_mint,
        associated_token::authority = user,
    )]
    pub user_defai_ata: Box<Account<'info, TokenAccount>>,
    
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = defai_mint,
        associated_token::authority = creator,
    )]
    pub creator_defai_ata: Box<Account<'info, TokenAccount>>,
    
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = defai_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_defai_ata: Box<Account<'info, TokenAccount>>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}