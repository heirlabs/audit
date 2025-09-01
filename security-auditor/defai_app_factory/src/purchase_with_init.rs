use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount, Mint},
};

use crate::{
    AppFactory, AppRegistration, UserAppAccess, AppFactoryError,
    purchase_app_pre_validation, execute_token_transfers, mint_app_sft,
};

#[derive(Accounts)]
#[instruction(app_id: u64)]
pub struct PurchaseAppWithInit<'info> {
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
    
    // Initialize user's SFT ATA if needed
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = sft_mint,
        associated_token::authority = user
    )]
    pub user_sft_ata: Box<Account<'info, TokenAccount>>,
    
    // User's DEFAI ATA must exist and have sufficient balance
    #[account(
        mut,
        associated_token::mint = defai_mint,
        associated_token::authority = user,
        constraint = user_defai_ata.amount >= app_registration.price 
            @ AppFactoryError::InsufficientBalance
    )]
    pub user_defai_ata: Box<Account<'info, TokenAccount>>,
    
    // Initialize creator's DEFAI ATA if needed
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = defai_mint,
        associated_token::authority = creator
    )]
    pub creator_defai_ata: Box<Account<'info, TokenAccount>>,
    
    // Initialize treasury's DEFAI ATA if needed
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = defai_mint,
        associated_token::authority = treasury
    )]
    pub treasury_defai_ata: Box<Account<'info, TokenAccount>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Creator must match registration
    #[account(address = app_registration.creator @ AppFactoryError::InvalidCreator)]
    pub creator: AccountInfo<'info>,
    
    /// CHECK: Treasury must match factory
    #[account(address = app_factory.treasury @ AppFactoryError::InvalidTreasury)]
    pub treasury: AccountInfo<'info>,
    
    #[account(
        constraint = defai_mint.key() == app_factory.defai_mint 
            @ AppFactoryError::InvalidDefaiMint
    )]
    pub defai_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn purchase_app_with_init(ctx: Context<PurchaseAppWithInit>, app_id: u64) -> Result<()> {
    let mut price = 0u64;
    let mut platform_fee = 0u64;
    let mut creator_amount = 0u64;

    // Pre-validation
    purchase_app_pre_validation(
        &ctx.accounts.app_registration,
        &ctx.accounts.app_factory,
        &mut price,
        &mut platform_fee,
        &mut creator_amount,
    )?;

    // Execute transfers
    execute_token_transfers(
        &ctx.accounts.user,
        &ctx.accounts.user_defai_ata,
        &ctx.accounts.creator_defai_ata,
        &ctx.accounts.treasury_defai_ata,
        &ctx.accounts.token_program,
        platform_fee,
        creator_amount,
    )?;

    // Mint SFT
    let bump = ctx.accounts.app_registration.bump;
    mint_app_sft(
        &ctx.accounts.app_registration,
        &ctx.accounts.sft_mint.to_account_info(),
        &ctx.accounts.user_sft_ata.to_account_info(),
        &ctx.accounts.token_program,
        app_id,
        bump,
    )?;

    // Update supply
    ctx.accounts.app_registration.current_supply = ctx.accounts.app_registration.current_supply
        .checked_add(1)
        .ok_or(AppFactoryError::MathOverflow)?;

    // Record access
    let user_app_access = &mut ctx.accounts.user_app_access;
    user_app_access.user = ctx.accounts.user.key();
    user_app_access.app_id = app_id;
    user_app_access.sft_token_account = ctx.accounts.user_sft_ata.key();
    user_app_access.purchased_at = Clock::get()?.unix_timestamp;
    user_app_access.bump = ctx.bumps.user_app_access;

    // Emit event
    emit!(crate::AppPurchased {
        app_id,
        user: ctx.accounts.user.key(),
        price,
        platform_fee,
        creator_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("User purchased app {} access (single transaction)", app_id);
    Ok(())
}