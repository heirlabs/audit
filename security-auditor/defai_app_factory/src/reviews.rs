use anchor_lang::prelude::*;
use crate::{UserAppAccess, AppFactoryError};

#[account]
pub struct AppReview {
    pub app_id: u64,
    pub reviewer: Pubkey,
    pub rating: u8, // 1-5
    pub comment_cid: String, // IPFS CID for comment
    pub timestamp: i64,
    pub bump: u8,
}

impl AppReview {
    pub const LEN: usize = 8 + 8 + 32 + 1 + (4 + 46) + 8 + 1; // ~100 bytes
}

#[derive(Accounts)]
#[instruction(app_id: u64)]
pub struct SubmitReview<'info> {
    #[account(
        init,
        payer = user,
        space = AppReview::LEN,
        seeds = [b"app_review", user.key().as_ref(), &app_id.to_le_bytes()],
        bump
    )]
    pub review: Account<'info, AppReview>,
    
    #[account(
        seeds = [b"user_app_access", user.key().as_ref(), &app_id.to_le_bytes()],
        bump = user_app_access.bump,
        has_one = user @ AppFactoryError::MustOwnAppToReview
    )]
    pub user_app_access: Account<'info, UserAppAccess>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(app_id: u64)]
pub struct UpdateReview<'info> {
    #[account(
        mut,
        seeds = [b"app_review", reviewer.key().as_ref(), &app_id.to_le_bytes()],
        bump = review.bump,
        has_one = reviewer @ AppFactoryError::UnauthorizedReviewer
    )]
    pub review: Account<'info, AppReview>,
    
    pub reviewer: Signer<'info>,
}

#[event]
pub struct ReviewSubmitted {
    pub app_id: u64,
    pub reviewer: Pubkey,
    pub rating: u8,
    pub comment_cid: String,
    pub timestamp: i64,
}

#[event]
pub struct ReviewUpdated {
    pub app_id: u64,
    pub reviewer: Pubkey,
    pub new_rating: u8,
    pub new_comment_cid: String,
    pub timestamp: i64,
}

#[error_code]
pub enum ReviewError {
    #[msg("Invalid rating - must be between 1 and 5")]
    InvalidRating,
    #[msg("Must own the app to review it")]
    MustOwnAppToReview,
    #[msg("Unauthorized reviewer")]
    UnauthorizedReviewer,
    #[msg("Comment CID too long (max 46 characters)")]
    CommentCidTooLong,
}

pub fn submit_review(
    ctx: Context<SubmitReview>,
    app_id: u64,
    rating: u8,
    comment_cid: String,
) -> Result<()> {
    require!(rating >= 1 && rating <= 5, ReviewError::InvalidRating);
    require!(comment_cid.len() <= 46, ReviewError::CommentCidTooLong); // IPFS CID v1 length
    
    // Create review
    let review = &mut ctx.accounts.review;
    review.app_id = app_id;
    review.reviewer = ctx.accounts.user.key();
    review.rating = rating;
    review.comment_cid = comment_cid.clone();
    review.timestamp = Clock::get()?.unix_timestamp;
    review.bump = ctx.bumps.review;
    
    // Emit event
    emit!(ReviewSubmitted {
        app_id,
        reviewer: ctx.accounts.user.key(),
        rating,
        comment_cid,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "User {} submitted a {}/5 review for app {}",
        ctx.accounts.user.key(),
        rating,
        app_id
    );
    
    Ok(())
}

pub fn update_review(
    ctx: Context<UpdateReview>,
    new_rating: u8,
    new_comment_cid: String,
) -> Result<()> {
    require!(new_rating >= 1 && new_rating <= 5, ReviewError::InvalidRating);
    require!(new_comment_cid.len() <= 46, ReviewError::CommentCidTooLong);
    
    let review = &mut ctx.accounts.review;
    let app_id = review.app_id;
    
    review.rating = new_rating;
    review.comment_cid = new_comment_cid.clone();
    review.timestamp = Clock::get()?.unix_timestamp;
    
    // Emit event
    emit!(ReviewUpdated {
        app_id,
        reviewer: ctx.accounts.reviewer.key(),
        new_rating,
        new_comment_cid,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "User {} updated their review to {}/5 for app {}",
        ctx.accounts.reviewer.key(),
        new_rating,
        app_id
    );
    
    Ok(())
}