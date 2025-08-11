use anchor_lang::prelude::*;

// Switchboard On-Demand Randomness Implementation
// This replaces the deprecated VRF Lite approach

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct RandomnessAccountData {
    pub seed: [u8; 32],
    pub value: [u8; 32],
    pub slot: u64,
    pub timestamp: i64,
}

#[account]
pub struct RandomnessState {
    pub bump: u8,
    pub authority: Pubkey,
    pub randomness_account: Pubkey,
    pub committed_slot: u64,
    pub revealed_value: [u8; 32],
    pub last_update: i64,
    pub is_pending: bool,
}

impl RandomnessState {
    pub const LEN: usize = 1 + 32 + 32 + 8 + 32 + 8 + 1;
}

#[derive(Accounts)]
pub struct InitializeRandomness<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + RandomnessState::LEN,
        seeds = [b"randomness_state"],
        bump
    )]
    pub randomness_state: Account<'info, RandomnessState>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitRandomness<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"randomness_state"],
        bump = randomness_state.bump,
        constraint = randomness_state.authority == authority.key()
    )]
    pub randomness_state: Account<'info, RandomnessState>,
    
    /// CHECK: Switchboard randomness account
    pub randomness_account: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RevealRandomness<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"randomness_state"],
        bump = randomness_state.bump,
        constraint = randomness_state.authority == authority.key()
    )]
    pub randomness_state: Account<'info, RandomnessState>,
    
    /// CHECK: Switchboard randomness account
    pub randomness_account: AccountInfo<'info>,
}

// Simple fallback randomness using recent blockhashes
#[derive(Accounts)]
pub struct SimpleRandomness<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"randomness_state"],
        bump = randomness_state.bump
    )]
    pub randomness_state: Account<'info, RandomnessState>,
    
    /// CHECK: Recent blockhashes sysvar
    #[account(address = solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: AccountInfo<'info>,
}

pub fn initialize_randomness(ctx: Context<InitializeRandomness>) -> Result<()> {
    let randomness_state = &mut ctx.accounts.randomness_state;
    randomness_state.bump = ctx.bumps.randomness_state;
    randomness_state.authority = ctx.accounts.authority.key();
    randomness_state.randomness_account = Pubkey::default();
    randomness_state.committed_slot = 0;
    randomness_state.revealed_value = [0u8; 32];
    randomness_state.last_update = Clock::get()?.unix_timestamp;
    randomness_state.is_pending = false;
    
    msg!("Randomness state initialized");
    Ok(())
}

pub fn commit_randomness(ctx: Context<CommitRandomness>) -> Result<()> {
    let randomness_state = &mut ctx.accounts.randomness_state;
    let clock = Clock::get()?;
    
    // Store the randomness account for later reveal
    randomness_state.randomness_account = ctx.accounts.randomness_account.key();
    randomness_state.committed_slot = clock.slot;
    randomness_state.is_pending = true;
    
    msg!("Randomness committed at slot {}", clock.slot);
    Ok(())
}

pub fn reveal_randomness(ctx: Context<RevealRandomness>) -> Result<()> {
    let randomness_state = &mut ctx.accounts.randomness_state;
    let clock = Clock::get()?;
    
    require!(
        randomness_state.is_pending,
        RandomnessError::NoCommitment
    );
    
    require!(
        ctx.accounts.randomness_account.key() == randomness_state.randomness_account,
        RandomnessError::InvalidRandomnessAccount
    );
    
    // Parse the randomness account data
    let data = ctx.accounts.randomness_account.try_borrow_data()?;
    if data.len() >= 104 {
        // Extract the random value (32 bytes at offset 40)
        randomness_state.revealed_value.copy_from_slice(&data[40..72]);
        randomness_state.last_update = clock.unix_timestamp;
        randomness_state.is_pending = false;
        
        msg!("Randomness revealed successfully");
    } else {
        return Err(RandomnessError::InvalidAccountData.into());
    }
    
    Ok(())
}

// Fallback: Simple on-chain randomness using blockhashes
// WARNING: This is less secure but works for testing
pub fn generate_simple_randomness(ctx: Context<SimpleRandomness>) -> Result<()> {
    let randomness_state = &mut ctx.accounts.randomness_state;
    let clock = Clock::get()?;
    
    // Use recent blockhashes as entropy source
    let recent_blockhashes_data = ctx.accounts.recent_blockhashes.try_borrow_data()?;
    
    // Combine multiple sources of entropy
    let mut hasher = solana_program::keccak::Hasher::default();
    hasher.hash(&recent_blockhashes_data[8..40]); // First blockhash
    hasher.hash(&clock.slot.to_le_bytes());
    hasher.hash(&clock.unix_timestamp.to_le_bytes());
    hasher.hash(&ctx.accounts.authority.key().to_bytes());
    
    let hash = hasher.result();
    randomness_state.revealed_value.copy_from_slice(&hash.to_bytes());
    randomness_state.last_update = clock.unix_timestamp;
    randomness_state.is_pending = false;
    
    msg!("Simple randomness generated");
    Ok(())
}

// Helper function to get a random number in range [min, max]
pub fn get_random_in_range(random_bytes: &[u8; 32], min: u64, max: u64) -> u64 {
    let range = max - min + 1;
    let random_u64 = u64::from_le_bytes([
        random_bytes[0], random_bytes[1], random_bytes[2], random_bytes[3],
        random_bytes[4], random_bytes[5], random_bytes[6], random_bytes[7],
    ]);
    min + (random_u64 % range)
}

// Compatibility function for VRF random generation (used by swap functions)
// This maintains the same interface but can use either old VRF or new randomness
pub fn generate_vrf_random(
    vrf_result: &[u8; 32],
    user: &Pubkey,
    nft_mint: &Pubkey,
) -> u64 {
    // Combine VRF/randomness result with user/mint for uniqueness
    let mut hasher = solana_program::keccak::Hasher::default();
    
    // VRF/randomness result (32 bytes) - cryptographically secure randomness
    hasher.hash(vrf_result);
    
    // User's public key (32 bytes) - ensures different values per user
    hasher.hash(&user.to_bytes());
    
    // NFT mint public key (32 bytes) - ensures different values per NFT
    hasher.hash(&nft_mint.to_bytes());
    
    // Hash all the data together
    let hash = hasher.result();
    
    // Convert first 8 bytes to u64
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&hash.to_bytes()[0..8]);
    u64::from_le_bytes(bytes)
}

// Calculate bonus using random value
pub fn calculate_random_bonus(
    random_value: u64,
    min_bonus: u16,
    max_bonus: u16,
) -> u16 {
    let bonus_range = max_bonus - min_bonus;
    if bonus_range == 0 {
        min_bonus
    } else {
        min_bonus + (random_value % (bonus_range as u64 + 1)) as u16
    }
}

// Fallback random generation using multiple entropy sources
pub fn generate_secure_random(
    user: &Pubkey,
    nft_mint: &Pubkey,
    clock: &Clock,
    recent_blockhash: &[u8; 32],
) -> u64 {
    // Combine multiple sources of entropy
    let mut hasher = solana_program::keccak::Hasher::default();
    
    hasher.hash(&user.to_bytes());
    hasher.hash(&nft_mint.to_bytes());
    hasher.hash(&clock.unix_timestamp.to_le_bytes());
    hasher.hash(&clock.slot.to_le_bytes());
    hasher.hash(recent_blockhash);
    hasher.hash(&clock.epoch.to_le_bytes());
    
    let hash = hasher.result();
    
    // Convert first 8 bytes to u64
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&hash.to_bytes()[0..8]);
    u64::from_le_bytes(bytes)
}

#[error_code]
pub enum RandomnessError {
    #[msg("No randomness commitment found")]
    NoCommitment,
    #[msg("Invalid randomness account")]
    InvalidRandomnessAccount,
    #[msg("Invalid account data")]
    InvalidAccountData,
    #[msg("Randomness not resolved yet")]
    RandomnessNotResolved,
    #[msg("Unauthorized")]
    Unauthorized,
}