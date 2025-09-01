use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, TokenAccount, Mint, Transfer, Burn},
};

use crate::{
    AppFactory, AppRegistration, UserAppAccess, AppFactoryError,
};

#[derive(Accounts)]
#[instruction(app_id: u64)]
pub struct RefundPurchase<'info> {
    #[account(
        seeds = [b"app_factory"],
        bump = app_factory.bump
    )]
    pub app_factory: Box<Account<'info, AppFactory>>,
    
    #[account(
        mut,
        seeds = [b"app_registration".as_ref(), &app_id.to_le_bytes()],
        bump = app_registration.bump
    )]
    pub app_registration: Box<Account<'info, AppRegistration>>,
    
    #[account(
        mut,
        seeds = [b"user_app_access".as_ref(), user.key().as_ref(), &app_id.to_le_bytes()],
        bump = user_app_access.bump,
        has_one = user,
        close = user
    )]
    pub user_app_access: Box<Account<'info, UserAppAccess>>,
    
    #[account(
        mut,
        address = app_registration.sft_mint
    )]
    pub sft_mint: Box<Account<'info, Mint>>,
    
    // User's SFT ATA (to burn the SFT)
    #[account(
        mut,
        associated_token::mint = sft_mint,
        associated_token::authority = user,
        constraint = user_sft_ata.amount > 0 @ AppFactoryError::NoSftToRefund
    )]
    pub user_sft_ata: Box<Account<'info, TokenAccount>>,
    
    // User's DEFAI ATA (to receive refund)
    #[account(
        mut,
        associated_token::mint = defai_mint,
        associated_token::authority = user
    )]
    pub user_defai_ata: Box<Account<'info, TokenAccount>>,
    
    // Creator's DEFAI ATA (to send refund from)
    #[account(
        mut,
        associated_token::mint = defai_mint,
        associated_token::authority = app_registration.creator,
        constraint = creator_defai_ata.amount >= refund_amount(app_registration.price, app_factory.platform_fee_bps)
            @ AppFactoryError::InsufficientCreatorBalance
    )]
    pub creator_defai_ata: Box<Account<'info, TokenAccount>>,
    
    // Treasury's DEFAI ATA (to send platform fee refund from)
    #[account(
        mut,
        associated_token::mint = defai_mint,
        associated_token::authority = app_factory.treasury
    )]
    pub treasury_defai_ata: Box<Account<'info, TokenAccount>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Creator must authorize refund
    #[account(
        address = app_registration.creator @ AppFactoryError::UnauthorizedCreator
    )]
    pub creator: Signer<'info>,
    
    /// CHECK: Treasury must authorize refund
    #[account(
        address = app_factory.treasury @ AppFactoryError::InvalidTreasury
    )]
    pub treasury: Signer<'info>,
    
    #[account(
        constraint = defai_mint.key() == app_factory.defai_mint 
            @ AppFactoryError::InvalidDefaiMint
    )]
    pub defai_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct AppRefunded {
    pub app_id: u64,
    pub user: Pubkey,
    pub refund_amount: u64,
    pub reason: String,
    pub timestamp: i64,
}

#[error_code]
pub enum RefundError {
    #[msg("Refund window has expired (24 hours)")]
    RefundWindowExpired,
    #[msg("No SFT to refund")]
    NoSftToRefund,
    #[msg("Insufficient creator balance for refund")]
    InsufficientCreatorBalance,
}

fn refund_amount(price: u64, platform_fee_bps: u16) -> u64 {
    // Calculate the creator's portion that needs to be refunded
    let platform_fee = price
        .checked_mul(platform_fee_bps as u64)
        .unwrap_or(0)
        .checked_div(10000)
        .unwrap_or(0);
    
    price.checked_sub(platform_fee).unwrap_or(price)
}

pub fn refund_purchase(
    ctx: Context<RefundPurchase>,
    app_id: u64,
    reason: String,
) -> Result<()> {
    // Check refund window (24 hours)
    let purchase_time = ctx.accounts.user_app_access.purchased_at;
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time - purchase_time <= 86400,
        RefundError::RefundWindowExpired
    );
    
    let price = ctx.accounts.app_registration.price;
    let platform_fee_bps = ctx.accounts.app_factory.platform_fee_bps;
    
    // Calculate refund amounts
    let platform_fee = price
        .checked_mul(platform_fee_bps as u64)
        .ok_or(AppFactoryError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AppFactoryError::MathOverflow)?;
    
    let creator_refund = price
        .checked_sub(platform_fee)
        .ok_or(AppFactoryError::MathOverflow)?;
    
    // Burn the SFT
    let burn_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.sft_mint.to_account_info(),
            from: ctx.accounts.user_sft_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::burn(burn_ctx, 1)?;
    
    // Refund from creator (minus platform fee)
    let creator_transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.creator_defai_ata.to_account_info(),
            to: ctx.accounts.user_defai_ata.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        },
    );
    token::transfer(creator_transfer_ctx, creator_refund)?;
    
    // Refund platform fee from treasury
    let treasury_transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.treasury_defai_ata.to_account_info(),
            to: ctx.accounts.user_defai_ata.to_account_info(),
            authority: ctx.accounts.treasury.to_account_info(),
        },
    );
    token::transfer(treasury_transfer_ctx, platform_fee)?;
    
    // Update supply count
    ctx.accounts.app_registration.current_supply = ctx.accounts.app_registration.current_supply
        .checked_sub(1)
        .ok_or(AppFactoryError::MathOverflow)?;
    
    // Emit event
    emit!(AppRefunded {
        app_id,
        user: ctx.accounts.user.key(),
        refund_amount: price,
        reason,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "Refunded {} DEFAI to user {} for app {}",
        price,
        ctx.accounts.user.key(),
        app_id
    );
    
    Ok(())
}