use anchor_lang::prelude::*;
use crate::{AppFactory, AppFactoryError};

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(
        mut,
        seeds = [b"app_factory"],
        bump = app_factory.bump,
        has_one = authority @ AppFactoryError::UnauthorizedAuthority
    )]
    pub app_factory: Account<'info, AppFactory>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [b"app_factory"],
        bump = app_factory.bump,
        constraint = Some(new_authority.key()) == app_factory.pending_authority 
            @ AppFactoryError::NotPendingAuthority
    )]
    pub app_factory: Account<'info, AppFactory>,
    
    pub new_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelAuthorityTransfer<'info> {
    #[account(
        mut,
        seeds = [b"app_factory"],
        bump = app_factory.bump,
        has_one = authority @ AppFactoryError::UnauthorizedAuthority
    )]
    pub app_factory: Account<'info, AppFactory>,
    
    pub authority: Signer<'info>,
}

#[event]
pub struct AuthorityTransferInitiated {
    pub from: Pubkey,
    pub to: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferAccepted {
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferCancelled {
    pub timestamp: i64,
}

#[error_code]
pub enum AuthorityError {
    #[msg("Not the pending authority")]
    NotPendingAuthority,
}

pub fn transfer_authority(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    ctx.accounts.app_factory.pending_authority = Some(new_authority);
    
    emit!(AuthorityTransferInitiated {
        from: ctx.accounts.authority.key(),
        to: new_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "Authority transfer initiated from {} to {}",
        ctx.accounts.authority.key(),
        new_authority
    );
    
    Ok(())
}

pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let app_factory = &mut ctx.accounts.app_factory;
    let old_authority = app_factory.authority;
    
    app_factory.authority = ctx.accounts.new_authority.key();
    app_factory.pending_authority = None;
    
    emit!(AuthorityTransferAccepted {
        new_authority: ctx.accounts.new_authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "Authority transferred from {} to {}",
        old_authority,
        ctx.accounts.new_authority.key()
    );
    
    Ok(())
}

pub fn cancel_authority_transfer(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
    require!(
        ctx.accounts.app_factory.pending_authority.is_some(),
        AuthorityError::NotPendingAuthority
    );
    ctx.accounts.app_factory.pending_authority = None;
    
    emit!(AuthorityTransferCancelled {
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Authority transfer cancelled");
    
    Ok(())
}