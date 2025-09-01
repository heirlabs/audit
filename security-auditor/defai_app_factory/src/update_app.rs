use anchor_lang::prelude::*;
use crate::{AppRegistration, AppFactoryError};

#[derive(Accounts)]
#[instruction(app_id: u64)]
pub struct UpdateAppMetadata<'info> {
    #[account(
        mut,
        seeds = [b"app_registration".as_ref(), &app_id.to_le_bytes()],
        bump = app_registration.bump,
        has_one = creator @ AppFactoryError::UnauthorizedCreator
    )]
    pub app_registration: Account<'info, AppRegistration>,
    
    pub creator: Signer<'info>,
}

#[event]
pub struct AppUpdated {
    pub app_id: u64,
    pub new_price: Option<u64>,
    pub new_metadata_uri: Option<String>,
    pub timestamp: i64,
}

pub fn update_app_metadata(
    ctx: Context<UpdateAppMetadata>,
    app_id: u64,
    new_metadata_uri: Option<String>,
    new_price: Option<u64>,
) -> Result<()> {
    let app_registration = &mut ctx.accounts.app_registration;
    
    // Update price if provided
    if let Some(price) = new_price {
        require!(price > 0, AppFactoryError::InvalidPrice);
        app_registration.price = price;
    }
    
    // Update metadata URI if provided
    if let Some(metadata_uri) = &new_metadata_uri {
        require!(
            metadata_uri.len() <= 100,
            AppFactoryError::MetadataUriTooLong
        );
        app_registration.metadata_uri = metadata_uri.clone();
    }
    
    // Emit event
    emit!(AppUpdated {
        app_id,
        new_price,
        new_metadata_uri,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "App {} updated by creator {}",
        app_id,
        ctx.accounts.creator.key()
    );
    
    Ok(())
}