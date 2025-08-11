use anchor_lang::prelude::*;
use crate::Config;

// VRF State to store randomness results
#[account]
pub struct VrfState {
    pub bump: u8,
    pub result_buffer: [u8; 32],
    pub last_timestamp: i64,
    pub vrf_account: Pubkey,
    pub oracle_queue: Pubkey,
    pub queue_authority: Pubkey,
    pub data_buffer: Pubkey,
    pub permission: Pubkey,
    pub escrow: Pubkey,
    pub payer_wallet: Pubkey,
}

impl VrfState {
    // Does not include the 8-byte discriminator
    pub const LEN: usize = 1 + 32 + 8 + 32 + (32 * 6);
}

#[derive(Accounts)]
pub struct InitializeVrf<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = VrfState::LEN,
        seeds = [b"vrf_state"],
        bump
    )]
    pub vrf_state: Account<'info, VrfState>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(
        mut,
        seeds = [b"vrf_state"],
        bump = vrf_state.bump
    )]
    pub vrf_state: Account<'info, VrfState>,
    
    /// CHECK: Switchboard VRF account
    #[account(constraint = vrf.key() == vrf_state.vrf_account)]
    pub vrf: AccountInfo<'info>,
    
    /// CHECK: Oracle queue account
    pub oracle_queue: AccountInfo<'info>,
    
    /// CHECK: Queue authority
    pub queue_authority: AccountInfo<'info>,
    
    /// CHECK: Data buffer
    pub data_buffer: AccountInfo<'info>,
    
    /// CHECK: Permission account
    pub permission: AccountInfo<'info>,
    
    /// CHECK: Escrow account
    pub escrow: AccountInfo<'info>,
    
    /// CHECK: Payer token wallet
    pub payer_wallet: AccountInfo<'info>,
    
    /// CHECK: Recent blockhashes
    pub recent_blockhashes: AccountInfo<'info>,
    
    /// CHECK: Switchboard program
    pub switchboard_program: AccountInfo<'info>,
    
    /// CHECK: Switchboard program state account (SB State)
    pub program_state: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ConsumeRandomness<'info> {
    #[account(
        mut,
        seeds = [b"vrf_state"],
        bump = vrf_state.bump
    )]
    pub vrf_state: Account<'info, VrfState>,
    
    /// CHECK: VRF account that must match stored account
    #[account(constraint = vrf.key() == vrf_state.vrf_account)]
    pub vrf: AccountInfo<'info>,
}

use anchor_spl::token::Token;
use anchor_lang::solana_program::{instruction::AccountMeta, instruction::Instruction, program::invoke_signed};

// Switchboard program ID constant to avoid long symbol names
pub const SWITCHBOARD_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    45, 191, 211, 253, 220, 54, 156, 186, 192, 46, 10, 172, 25, 91, 51, 46,
    200, 36, 75, 90, 105, 231, 7, 95, 204, 83, 82, 6, 87, 214, 143, 138
]);

pub fn initialize_vrf(ctx: Context<InitializeVrf>, vrf_account: Pubkey) -> Result<()> {
    let vrf_state = &mut ctx.accounts.vrf_state;
    vrf_state.bump = ctx.bumps.vrf_state;
    vrf_state.result_buffer = [0u8; 32];
    vrf_state.last_timestamp = 0;
    vrf_state.vrf_account = vrf_account;
    vrf_state.oracle_queue = Pubkey::default();
    vrf_state.queue_authority = Pubkey::default();
    vrf_state.data_buffer = Pubkey::default();
    vrf_state.permission = Pubkey::default();
    vrf_state.escrow = Pubkey::default();
    vrf_state.payer_wallet = Pubkey::default();
    
    msg!("VRF state initialized with account: {}", vrf_account);
    Ok(())
}

pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
    // Admin-gated configuration on first request, and strict validation thereafter
    require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.config.admin, crate::ErrorCode::Unauthorized);
    // Enforce Switchboard program id / VRF owner
    require_keys_eq!(*ctx.accounts.switchboard_program.key, SWITCHBOARD_PROGRAM_ID, VrfError::InvalidVrfAccount);
    require_keys_eq!(*ctx.accounts.vrf.owner, SWITCHBOARD_PROGRAM_ID, VrfError::InvalidVrfAccount);
    
    let vrf_state = &mut ctx.accounts.vrf_state;
    // Bootstrap config if not set; otherwise enforce exact match
    if vrf_state.oracle_queue == Pubkey::default() {
        vrf_state.oracle_queue = ctx.accounts.oracle_queue.key();
        vrf_state.queue_authority = ctx.accounts.queue_authority.key();
        vrf_state.data_buffer = ctx.accounts.data_buffer.key();
        vrf_state.permission = ctx.accounts.permission.key();
        vrf_state.escrow = ctx.accounts.escrow.key();
        vrf_state.payer_wallet = ctx.accounts.payer_wallet.key();
    } else {
        require_keys_eq!(ctx.accounts.oracle_queue.key(), vrf_state.oracle_queue, VrfError::InvalidVrfAccount);
        require_keys_eq!(ctx.accounts.queue_authority.key(), vrf_state.queue_authority, VrfError::InvalidVrfAccount);
        require_keys_eq!(ctx.accounts.data_buffer.key(), vrf_state.data_buffer, VrfError::InvalidVrfAccount);
        require_keys_eq!(ctx.accounts.permission.key(), vrf_state.permission, VrfError::InvalidVrfAccount);
        require_keys_eq!(ctx.accounts.escrow.key(), vrf_state.escrow, VrfError::InvalidVrfAccount);
        require_keys_eq!(ctx.accounts.payer_wallet.key(), vrf_state.payer_wallet, VrfError::InvalidVrfAccount);
    }

    // Build the account metas for the VRF Lite request and invoke_signed
    let signer_seeds: &[&[&[u8]]] = &[&[b"vrf_state", &[vrf_state.bump]]];

    // Note: Switchboard crate does not export CPI helper structs directly in src; construct instruction
    // Build account metas in correct order per docs
    let accounts = vec![
        AccountMeta::new(vrf_state.key(), true),                    // authority (signer)
        AccountMeta::new(*ctx.accounts.vrf.key, true),              // vrf_lite (writable)
        AccountMeta::new(*ctx.accounts.oracle_queue.key, true),     // queue (writable)
        AccountMeta::new_readonly(*ctx.accounts.queue_authority.key, false),
        AccountMeta::new_readonly(*ctx.accounts.data_buffer.key, false),
        AccountMeta::new_readonly(*ctx.accounts.permission.key, false),
        AccountMeta::new(*ctx.accounts.escrow.key, false),          // escrow TokenAccount (writable)
        AccountMeta::new_readonly(*ctx.accounts.recent_blockhashes.key, false),
        AccountMeta::new_readonly(*ctx.accounts.program_state.key, false),
        AccountMeta::new_readonly(*ctx.accounts.token_program.key, false),
    ];

    // Discriminator for VrfLiteRequestRandomness per docs
    let discriminator: [u8; 8] = [221, 11, 167, 47, 80, 107, 18, 71];
    let mut data = discriminator.to_vec();
    // Params: VrfLiteRequestRandomnessParams { callback: Option<Callback> } -> None
    data.extend_from_slice(&[0]);

    let ix = Instruction {
        program_id: SWITCHBOARD_PROGRAM_ID,
        accounts,
        data,
    };

    invoke_signed(
        &ix,
        &[
            vrf_state.to_account_info(),
            ctx.accounts.vrf.clone(),
            ctx.accounts.oracle_queue.clone(),
            ctx.accounts.queue_authority.clone(),
            ctx.accounts.data_buffer.clone(),
            ctx.accounts.permission.clone(),
            ctx.accounts.escrow.clone(),
            ctx.accounts.recent_blockhashes.clone(),
            ctx.accounts.program_state.clone(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer_seeds,
    )?;
    msg!("Randomness requested from VRF account: {}", ctx.accounts.vrf.key());
    
    // Update the timestamp to track when request was made
    vrf_state.last_timestamp = Clock::get()?.unix_timestamp;
    
    Ok(())
}

pub fn consume_randomness(ctx: Context<ConsumeRandomness>) -> Result<()> {
    let vrf_state = &mut ctx.accounts.vrf_state;
    let clock = Clock::get()?;
    // Enforce Switchboard VRF owner
    require_keys_eq!(*ctx.accounts.vrf.owner, SWITCHBOARD_PROGRAM_ID, VrfError::InvalidVrfAccount);

    // Parse VRF Lite account and write exact 32-byte result
    // Manually parse via docs: discriminator + packed struct
    let data_ref = ctx.accounts.vrf.try_borrow_data()?;
    // VrfLiteAccountData::discriminator() check is enforced by Switchboard program id equality on client; here, ensure length
    require!(data_ref.len() >= 8 + 32, VrfError::ResultNotReady);
    // The result field sits at a fixed offset in the struct. From docs, result is the 5th field after 8-byte discriminator.
    // Layout: [disc(8)] state_bump(1) permission_bump(1) vrf_pool(32) status(1) result(32) ... packed
    let mut result = [0u8; 32];
    let result_offset = 8 + 1 + 1 + 32 + 1; // = 43
    if data_ref.len() >= result_offset + 32 {
        result.copy_from_slice(&data_ref[result_offset..result_offset + 32]);
    }

    // Ensure result is ready (non-zero)
    require!(result.iter().any(|b| *b != 0), VrfError::ResultNotReady);

    vrf_state.result_buffer = result;
    vrf_state.last_timestamp = clock.unix_timestamp;

    msg!("VRF randomness consumed and stored");
    Ok(())
}

#[error_code]
pub enum VrfError {
    #[msg("VRF result not ready")]
    ResultNotReady,
    #[msg("Invalid VRF account")]
    InvalidVrfAccount,
}