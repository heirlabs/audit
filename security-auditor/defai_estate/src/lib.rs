use anchor_lang::prelude::*;
use anchor_lang::accounts::interface_account::InterfaceAccount;
use anchor_lang::accounts::interface::Interface;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::token_interface::{TokenInterface, Mint as MintInterface, TokenAccount as TokenAccountInterface};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("HvyyPrXbrhNEiGhttDUGMsYjKDPkYER2uFaLo7Bkei92");

// Estate Seeds
pub const ESTATE_SEED: &[u8] = b"estate";
pub const RWA_SEED: &[u8] = b"rwa";
pub const COUNTER_SEED: &[u8] = b"counter";
pub const CLAIM_SEED: &[u8] = b"claim";
pub const ASSET_SUMMARY_SEED: &[u8] = b"asset_summary";
pub const RECOVERY_SEED: &[u8] = b"recovery";

// Trading Seeds
pub const ESTATE_VAULT_SEED: &[u8] = b"estate_vault";

// Estate Constants
pub const MIN_INACTIVITY_PERIOD: i64 = 24 * 60 * 60; // 24 hours in seconds
pub const MAX_INACTIVITY_PERIOD: i64 = 300 * 365 * 24 * 60 * 60; // 300 years in seconds
pub const MIN_GRACE_PERIOD: i64 = 24 * 60 * 60; // 24 hours in seconds
pub const MAX_GRACE_PERIOD: i64 = 90 * 24 * 60 * 60; // 90 days in seconds
pub const MAX_BENEFICIARIES: u8 = 10;
pub const ESTATE_FEE: u64 = 100_000_000; // 0.1 SOL
pub const RWA_FEE: u64 = 10_000_000; // 0.01 SOL
pub const MIN_RENT_BALANCE: u64 = 890880; // Minimum rent-exempt balance for a basic account

// Joint Account Constants
pub const MAX_PROFIT_SHARE: u8 = 50; // Maximum AI agent profit share (50%)
pub const MIN_EMERGENCY_DELAY: u32 = 24; // 24 hours minimum
pub const MAX_EMERGENCY_DELAY: u32 = 168; // 7 days maximum

// Admin Constants
pub const ADMIN_TIMELOCK_DURATION: i64 = 48 * 60 * 60; // 48 hours for admin actions
pub const MAX_SIGNERS: usize = 10;
pub const MIN_SIGNERS: usize = 2;
pub const MAX_PROPOSALS: usize = 20;

#[program]
pub mod defai_estate {
    use super::*;

    // ===== Multi-sig Functions =====
    
    pub fn initialize_multisig(
        ctx: Context<InitializeMultisig>,
        signers: Vec<Pubkey>,
        threshold: u8,
    ) -> Result<()> {
        require!(
            signers.len() >= MIN_SIGNERS && signers.len() <= MAX_SIGNERS,
            EstateError::InvalidSignerCount
        );
        require!(
            threshold > 0 && threshold as usize <= signers.len(),
            EstateError::InvalidThreshold
        );
        
        let multisig_key = ctx.accounts.multisig.key();
        
        let multisig = &mut ctx.accounts.multisig;
        multisig.signers = signers.clone();
        multisig.threshold = threshold;
        multisig.proposal_count = 0;
        multisig.admin = ctx.accounts.admin.key();
        multisig.pending_admin = None;
        multisig.admin_change_timestamp = 0;
        
        msg!("Multisig initialized with {} signers, threshold: {}", signers.len(), threshold);
        
        emit!(MultisigCreated {
            multisig_address: multisig_key,
            signers,
            threshold,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn propose_admin_change(
        ctx: Context<ProposeAdminChange>,
        new_admin: Pubkey,
    ) -> Result<()> {
        let multisig = &mut ctx.accounts.multisig;
        
        require!(
            ctx.accounts.signer.key() == multisig.admin,
            EstateError::UnauthorizedAccess
        );
        
        multisig.pending_admin = Some(new_admin);
        multisig.admin_change_timestamp = Clock::get()?.unix_timestamp + ADMIN_TIMELOCK_DURATION;
        
        msg!("Admin change proposed. Can be executed after {}", multisig.admin_change_timestamp);
        
        emit!(AdminChangeProposed {
            old_admin: multisig.admin,
            new_admin,
            execute_after: multisig.admin_change_timestamp,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn accept_admin_change(ctx: Context<AcceptAdminChange>) -> Result<()> {
        let multisig = &mut ctx.accounts.multisig;
        
        require!(
            multisig.pending_admin.is_some(),
            EstateError::NoPendingAdminChange
        );
        require!(
            Clock::get()?.unix_timestamp >= multisig.admin_change_timestamp,
            EstateError::TimelockNotExpired
        );
        
        let old_admin = multisig.admin;
        let new_admin = multisig.pending_admin.unwrap();
        multisig.admin = new_admin;
        multisig.pending_admin = None;
        multisig.admin_change_timestamp = 0;
        
        msg!("Admin changed from {} to {}", old_admin, new_admin);
        
        emit!(AdminChangeExecuted {
            old_admin,
            new_admin,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        target_estate: Pubkey,
        action: ProposalAction,
    ) -> Result<()> {
        let multisig_key = ctx.accounts.multisig.key();
        let proposer_key = ctx.accounts.proposer.key();
        
        // Get values from multisig before mutable borrows
        let proposal_id = ctx.accounts.multisig.proposal_count;
        let is_authorized = ctx.accounts.multisig.signers.contains(&proposer_key);
        
        // Verify signer is authorized
        require!(
            is_authorized,
            EstateError::UnauthorizedSigner
        );
        
        // Initialize proposal
        let proposal = &mut ctx.accounts.proposal;
        proposal.multisig = multisig_key;
        proposal.proposer = proposer_key;
        proposal.target_estate = target_estate;
        proposal.action = action.clone();
        proposal.approvals = vec![proposer_key];
        proposal.executed = false;
        proposal.created_at = Clock::get()?.unix_timestamp;
        proposal.proposal_id = proposal_id;
        
        // Update multisig
        let multisig = &mut ctx.accounts.multisig;
        multisig.proposal_count += 1;
        
        msg!("Proposal {} created by {}", proposal.proposal_id, ctx.accounts.proposer.key());
        
        emit!(ProposalCreated {
            proposal_id: proposal.proposal_id,
            proposer: proposal.proposer,
            target_estate,
            action,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn approve_proposal(ctx: Context<ApproveProposal>) -> Result<()> {
        let multisig = &ctx.accounts.multisig;
        let proposal = &mut ctx.accounts.proposal;
        
        // Verify signer is authorized
        require!(
            multisig.signers.contains(&ctx.accounts.signer.key()),
            EstateError::UnauthorizedSigner
        );
        
        // Check if already approved
        require!(
            !proposal.approvals.contains(&ctx.accounts.signer.key()),
            EstateError::AlreadyApproved
        );
        
        // Check proposal not executed
        require!(!proposal.executed, EstateError::ProposalAlreadyExecuted);
        
        // Add approval
        proposal.approvals.push(ctx.accounts.signer.key());
        
        msg!(
            "Proposal {} approved by {}. Total approvals: {}/{}",
            proposal.proposal_id,
            ctx.accounts.signer.key(),
            proposal.approvals.len(),
            multisig.threshold
        );
        
        emit!(ProposalApproved {
            proposal_id: proposal.proposal_id,
            approver: ctx.accounts.signer.key(),
            total_approvals: proposal.approvals.len() as u8,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let multisig = &ctx.accounts.multisig;
        let proposal = &mut ctx.accounts.proposal;
        
        // Check threshold met
        require!(
            proposal.approvals.len() >= multisig.threshold as usize,
            EstateError::InsufficientApprovals
        );
        
        // Check not already executed
        require!(!proposal.executed, EstateError::ProposalAlreadyExecuted);
        
        // Mark as executed
        proposal.executed = true;
        
        msg!("Proposal {} executed", proposal.proposal_id);
        
        emit!(ProposalExecuted {
            proposal_id: proposal.proposal_id,
            executor: ctx.accounts.executor.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    // ===== Estate Functions =====
    
    pub fn initialize_global_counter(ctx: Context<InitializeGlobalCounter>) -> Result<()> {
        let global_counter = &mut ctx.accounts.global_counter;
        global_counter.count = 0;
        
        msg!("Global counter initialized");
        Ok(())
    }

    pub fn create_estate(
        ctx: Context<CreateEstate>,
        inactivity_period: i64,
        grace_period: i64,
        owner_email_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            inactivity_period >= MIN_INACTIVITY_PERIOD && inactivity_period <= MAX_INACTIVITY_PERIOD,
            EstateError::InvalidInactivityPeriod
        );
        require!(
            grace_period >= MIN_GRACE_PERIOD && grace_period <= MAX_GRACE_PERIOD,
            EstateError::InvalidGracePeriod
        );

        let estate = &mut ctx.accounts.estate;
        let clock = Clock::get()?;
        
        estate.estate_id = ctx.accounts.estate_mint.key();
        estate.owner = ctx.accounts.owner.key();
        estate.owner_email_hash = owner_email_hash;
        estate.last_active = clock.unix_timestamp;
        estate.inactivity_period = inactivity_period;
        estate.grace_period = grace_period;
        estate.beneficiaries = Vec::new();
        estate.total_beneficiaries = 0;
        estate.creation_time = clock.unix_timestamp;
        estate.estate_value = 0;
        estate.is_locked = false;
        estate.is_claimable = false;
        estate.total_rwas = 0;
        estate.estate_number = ctx.accounts.global_counter.count;
        estate.total_claims = 0;
        
        // Initialize trading fields (disabled by default)
        estate.trading_enabled = false;
        estate.ai_agent = None;
        estate.trading_strategy = None;
        estate.human_contribution = 0;
        estate.ai_contribution = 0;
        estate.trading_value = 0;
        estate.trading_profit = 0;
        estate.high_water_mark = 0;
        estate.human_share = 0;
        estate.ai_share = 0;
        estate.stop_loss = None;
        estate.emergency_delay_hours = 0;
        estate.emergency_withdrawal_initiated = false;
        estate.emergency_withdrawal_time = 0;
        estate.last_trading_update = clock.unix_timestamp;
        estate.multisig = None;

        // Update global counter
        ctx.accounts.global_counter.count += 1;

        msg!("Estate #{} created", estate.estate_number);
        
        // Emit estate created event
        emit!(EstateCreated {
            estate_id: estate.estate_id,
            owner: estate.owner,
            estate_number: estate.estate_number,
            inactivity_period,
            grace_period,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    // ===== Trading Functions =====
    
    pub fn enable_trading(
        ctx: Context<EnableTrading>,
        ai_agent: Pubkey,
        human_share: u8,
        strategy: TradingStrategy,
        stop_loss: Option<u8>,
        emergency_delay_hours: u32,
    ) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        
        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );
        require!(!estate.trading_enabled, EstateError::TradingAlreadyEnabled);
        require!(
            human_share >= 50 && human_share <= 100,
            EstateError::InvalidProfitShare
        );
        require!(
            emergency_delay_hours >= MIN_EMERGENCY_DELAY && emergency_delay_hours <= MAX_EMERGENCY_DELAY,
            EstateError::InvalidEmergencyDelay
        );
        
        let clock = Clock::get()?;
        
        // Enable trading on the estate
        estate.trading_enabled = true;
        estate.ai_agent = Some(ai_agent);
        estate.trading_strategy = Some(strategy);
        estate.human_share = human_share;
        estate.ai_share = 100 - human_share;
        estate.stop_loss = stop_loss;
        estate.emergency_delay_hours = emergency_delay_hours;
        estate.last_trading_update = clock.unix_timestamp;
        
        // Reset trading values
        estate.human_contribution = 0;
        estate.ai_contribution = 0;
        estate.trading_value = 0;
        estate.trading_profit = 0;
        estate.high_water_mark = 0;
        estate.emergency_withdrawal_initiated = false;
        estate.emergency_withdrawal_time = 0;
        
        msg!(
            "Trading enabled for Estate #{} with {}% human share",
            estate.estate_number,
            human_share
        );
        
        // Emit trading enabled event
        emit!(TradingEnabled {
            estate_id: estate.estate_id,
            ai_agent,
            human_share,
            ai_share: estate.ai_share,
            strategy,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn pause_trading(ctx: Context<PauseTrading>) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        
        require!(estate.trading_enabled, EstateError::TradingNotEnabled);
        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );
        
        estate.trading_enabled = false;
        estate.last_trading_update = Clock::get()?.unix_timestamp;
        
        msg!("Trading paused for Estate #{}", estate.estate_number);
        
        emit!(TradingPaused {
            estate_id: estate.estate_id,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn resume_trading(ctx: Context<ResumeTrading>) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        
        require!(!estate.trading_enabled, EstateError::TradingAlreadyEnabled);
        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );
        require!(
            estate.ai_agent.is_some(),
            EstateError::TradingNotInitialized
        );
        
        estate.trading_enabled = true;
        estate.last_trading_update = Clock::get()?.unix_timestamp;
        
        msg!("Trading resumed for Estate #{}", estate.estate_number);
        
        emit!(TradingResumed {
            estate_id: estate.estate_id,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    // Initialize a per-estate SPL token vault for a given mint, owned by the estate PDA
    pub fn init_estate_vault(ctx: Context<InitEstateVault>) -> Result<()> {
        use anchor_lang::system_program;
        
        // Get required account infos
        let rent = Rent::get()?;
        let space = TokenAccount::LEN;
        let lamports = rent.minimum_balance(space);
        
        // Create the token account
        let estate_key = ctx.accounts.estate.key();
        let mint_key = ctx.accounts.token_mint.key();
        let vault_seeds = &[
            ESTATE_VAULT_SEED,
            estate_key.as_ref(),
            mint_key.as_ref(),
            &[ctx.bumps.estate_vault],
        ];
        let signer = &[&vault_seeds[..]];
        
        // Create account
        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.estate_vault.to_account_info(),
                },
                signer,
            ),
            lamports,
            space as u64,
            ctx.accounts.token_program.key,
        )?;
        
        // Initialize token account
        let init_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::InitializeAccount3 {
                account: ctx.accounts.estate_vault.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                authority: ctx.accounts.estate.to_account_info(),
            },
            signer,
        );
        anchor_spl::token_interface::initialize_account3(init_ctx)?;
        
        msg!("Initialized estate vault for mint {}", ctx.accounts.token_mint.key());
        Ok(())
    }
    
    pub fn contribute_to_trading(
        ctx: Context<ContributeToTrading>,
        amount: u64,
    ) -> Result<()> {
        // Validate token account constraints
        require!(
            ctx.accounts.contributor_token_account.mint == ctx.accounts.token_mint.key(),
            EstateError::InvalidTokenMint
        );
        require!(
            ctx.accounts.contributor_token_account.owner == ctx.accounts.contributor.key(),
            EstateError::InvalidTokenOwner
        );
        require!(
            ctx.accounts.estate_vault.mint == ctx.accounts.token_mint.key(),
            EstateError::InvalidTokenMint
        );
        require!(
            ctx.accounts.estate_vault.owner == ctx.accounts.estate.key(),
            EstateError::InvalidTokenOwner
        );
        
        let estate = &mut ctx.accounts.estate;
        
        require!(estate.trading_enabled, EstateError::TradingNotEnabled);
        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        
        // Determine if contributor is human or AI
        let is_human = ctx.accounts.contributor.key() == estate.owner;
        let is_ai = estate.ai_agent.is_some() && ctx.accounts.contributor.key() == estate.ai_agent.unwrap();
        
        require!(is_human || is_ai, EstateError::UnauthorizedContributor);
        
        // Transfer tokens to estate vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.contributor_token_account.to_account_info(),
            to: ctx.accounts.estate_vault.to_account_info(),
            authority: ctx.accounts.contributor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        
        // Update contributions
        if is_human {
            estate.human_contribution += amount;
        } else {
            estate.ai_contribution += amount;
        }
        
        estate.trading_value += amount;
        estate.last_trading_update = Clock::get()?.unix_timestamp;
        
        // Auto check-in when contributing
        estate.check_in()?;
        
        msg!(
            "Contributed {} to estate trading. Total value: {}",
            amount,
            estate.trading_value
        );
        
        // Emit trading contribution event
        emit!(TradingContribution {
            estate_id: estate.estate_id,
            contributor: ctx.accounts.contributor.key(),
            amount,
            is_human,
            total_value: estate.trading_value,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    // Helper to deposit tokens into the estate vault for a given mint
 pub fn deposit_token_to_estate(ctx: Context<DepositTokenToEstate>, amount: u64) -> Result<()> {
    // Validate token account constraints
    require!(
        ctx.accounts.depositor_token_account.mint == ctx.accounts.token_mint.key(),
        EstateError::InvalidTokenMint
    );
    require!(
        ctx.accounts.depositor_token_account.owner == ctx.accounts.depositor.key(),
        EstateError::InvalidTokenOwner
    );
    require!(
        ctx.accounts.estate_vault.mint == ctx.accounts.token_mint.key(),
        EstateError::InvalidTokenMint
    );
    require!(
        ctx.accounts.estate_vault.owner == ctx.accounts.estate.key(),
        EstateError::InvalidTokenOwner
    );
    
    // Use token_interface for Token 2022 compatibility
    let cpi_accounts = anchor_spl::token_interface::TransferChecked {
        from: ctx.accounts.depositor_token_account.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
        to: ctx.accounts.estate_vault.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    // Use transfer_checked for Token 2022 compatibility
    anchor_spl::token_interface::transfer_checked(
        cpi_ctx,
        amount,
        ctx.accounts.token_mint.decimals,
    )?;
    
    Ok(())
}
    
    pub fn update_trading_value(
        ctx: Context<UpdateTradingValue>,
        new_total_value: u64,
    ) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        
        require!(estate.trading_enabled, EstateError::TradingNotEnabled);
        require!(
            estate.ai_agent.is_some() && ctx.accounts.ai_agent.key() == estate.ai_agent.unwrap(),
            EstateError::UnauthorizedAccess
        );
        
        let old_value = estate.trading_value;
        estate.trading_value = new_total_value;
        
        // Calculate profit
        let total_contributions = estate.human_contribution + estate.ai_contribution;
        if new_total_value > total_contributions {
            estate.trading_profit = (new_total_value - total_contributions) as i64;
        } else {
            estate.trading_profit = -((total_contributions - new_total_value) as i64);
        }
        
        // Update high water mark
        if new_total_value > estate.high_water_mark {
            estate.high_water_mark = new_total_value;
        }
        
        estate.last_trading_update = Clock::get()?.unix_timestamp;
        
        msg!(
            "Estate trading value updated from {} to {}. Profit: {}",
            old_value,
            new_total_value,
            estate.trading_profit
        );
        
        // Emit trading value updated event
        emit!(TradingValueUpdated {
            estate_id: estate.estate_id,
            old_value,
            new_value: new_total_value,
            profit: estate.trading_profit,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn distribute_trading_profits(
        ctx: Context<DistributeTradingProfits>,
    ) -> Result<()> {
        // Extract estate account info before mutable borrow
        let estate_info = ctx.accounts.estate.to_account_info();
        
        let estate = &mut ctx.accounts.estate;
        
        require!(estate.trading_enabled, EstateError::TradingNotEnabled);
        require!(estate.trading_profit > 0, EstateError::NoProfitsToDistribute);
        
        // Calculate distributable profit (above high water mark)
        let distributable_profit = if estate.trading_value > estate.high_water_mark {
            estate.trading_value - estate.high_water_mark
        } else {
            0
        };
        
        require!(distributable_profit > 0, EstateError::NoProfitsToDistribute);
        
        // Calculate shares
        let human_profit_share = (distributable_profit as u128)
            .checked_mul(estate.human_share as u128)
            .unwrap()
            .checked_div(100)
            .unwrap() as u64;
        let ai_profit_share = distributable_profit - human_profit_share;
        
        // Extract values before transfer to avoid borrow issues
        let estate_owner = estate.owner;
        let estate_number_bytes = estate.estate_number.to_le_bytes();
        
        // Transfer profits
        // Human share
        if human_profit_share > 0 {
            let transfer_to_human = Transfer {
                from: ctx.accounts.estate_vault.to_account_info(),
                to: ctx.accounts.human_token_account.to_account_info(),
                authority: estate_info.clone(),
            };
            let seeds = &[
                ESTATE_SEED,
                estate.owner.as_ref(),
                estate_number_bytes.as_ref(),
                &[ctx.bumps.estate],
            ];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_to_human,
                signer,
            );
            token::transfer(cpi_ctx, human_profit_share)?;
        }
        
        // AI share
        if ai_profit_share > 0 {
            let transfer_to_ai = Transfer {
                from: ctx.accounts.estate_vault.to_account_info(),
                to: ctx.accounts.ai_token_account.to_account_info(),
                authority: estate_info,
            };
            let seeds = &[
                ESTATE_SEED,
                estate_owner.as_ref(),
                estate_number_bytes.as_ref(),
                &[ctx.bumps.estate],
            ];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_to_ai,
                signer,
            );
            token::transfer(cpi_ctx, ai_profit_share)?;
        }
        
        // Update estate
        estate.high_water_mark = estate.trading_value;
        estate.trading_value -= distributable_profit;
        estate.last_trading_update = Clock::get()?.unix_timestamp;
        
        msg!(
            "Distributed profits - Human: {}, AI: {}",
            human_profit_share,
            ai_profit_share
        );
        
        // Emit profits distributed event
        emit!(ProfitsDistributed {
            estate_id: estate.estate_id,
            human_withdrawal: human_profit_share,
            ai_withdrawal: ai_profit_share,
            remaining_value: estate.trading_value,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn initiate_trading_emergency_withdrawal(
        ctx: Context<InitiateTradingEmergencyWithdrawal>,
    ) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        let clock = Clock::get()?;
        
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );
        require!(estate.trading_enabled, EstateError::TradingNotEnabled);
        require!(
            !estate.emergency_withdrawal_initiated,
            EstateError::EmergencyWithdrawalAlreadyInitiated
        );
        
        estate.emergency_withdrawal_initiated = true;
        estate.emergency_withdrawal_time = clock.unix_timestamp + 
            (estate.emergency_delay_hours as i64 * 60 * 60);
        
        msg!(
            "Emergency withdrawal initiated. Can execute after {}",
            estate.emergency_withdrawal_time
        );
        
        // Emit emergency withdrawal initiated event
        emit!(EmergencyWithdrawalInitiated {
            estate_id: estate.estate_id,
            initiator: ctx.accounts.owner.key(),
            execute_after: estate.emergency_withdrawal_time,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }
    
    pub fn execute_trading_emergency_withdrawal(
        ctx: Context<ExecuteTradingEmergencyWithdrawal>,
    ) -> Result<()> {
        // Extract estate account info before mutable borrow
        let estate_info = ctx.accounts.estate.to_account_info();
        
        let estate = &mut ctx.accounts.estate;
        let clock = Clock::get()?;
        
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );
        require!(
            estate.emergency_withdrawal_initiated,
            EstateError::EmergencyWithdrawalNotInitiated
        );
        require!(
            clock.unix_timestamp >= estate.emergency_withdrawal_time,
            EstateError::EmergencyWithdrawalNotReady
        );
        
        // Calculate human's proportional share
        let total_contributions = estate.human_contribution + estate.ai_contribution;
        let human_proportion = if total_contributions > 0 {
            (estate.human_contribution as u128)
                .checked_mul(estate.trading_value as u128)
                .unwrap()
                .checked_div(total_contributions as u128)
                .unwrap() as u64
        } else {
            0
        };
        
        // Extract values before transfer to avoid borrow issues
        let estate_owner = estate.owner;
        let estate_number_bytes = estate.estate_number.to_le_bytes();
        
        // Transfer funds
        if human_proportion > 0 {
            let transfer_ix = Transfer {
                from: ctx.accounts.estate_vault.to_account_info(),
                to: ctx.accounts.human_token_account.to_account_info(),
                authority: estate_info,
            };
            let seeds = &[
                ESTATE_SEED,
                estate_owner.as_ref(),
                estate_number_bytes.as_ref(),
                &[ctx.bumps.estate],
            ];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_ix,
                signer,
            );
            token::transfer(cpi_ctx, human_proportion)?;
        }
        
        // Reset trading state
        estate.trading_enabled = false;
        estate.ai_agent = None;
        estate.trading_strategy = None;
        estate.human_contribution = 0;
        estate.ai_contribution = 0;
        estate.trading_value = 0;
        estate.trading_profit = 0;
        estate.high_water_mark = 0;
        estate.emergency_withdrawal_initiated = false;
        estate.emergency_withdrawal_time = 0;
        
        msg!("Emergency withdrawal executed. Withdrawn: {}", human_proportion);
        
        Ok(())
    }

    // ===== Existing Estate Functions Continue =====
    
    pub fn check_in(ctx: Context<CheckIn>) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        let clock = Clock::get()?;

        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );

        estate.last_active = clock.unix_timestamp;
        estate.is_claimable = false;

        msg!("Estate check-in successful. Timer reset.");
        
        // Emit check-in event
        emit!(EstateCheckedIn {
            estate_id: estate.estate_id,
            owner: estate.owner,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn update_beneficiaries(
        ctx: Context<UpdateBeneficiaries>,
        beneficiaries: Vec<Beneficiary>,
    ) -> Result<()> {
        let estate = &mut ctx.accounts.estate;

        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        
        // Check authorization - either owner or multisig
        let is_owner = ctx.accounts.owner.key() == estate.owner;
        let is_multisig = estate.multisig.is_some() && 
            ctx.accounts.owner.key() == estate.multisig.unwrap();
        
        require!(
            is_owner || is_multisig,
            EstateError::UnauthorizedAccess
        );
        require!(
            beneficiaries.len() <= MAX_BENEFICIARIES as usize,
            EstateError::TooManyBeneficiaries
        );

        // Validate percentages sum to 100
        let total_percentage: u8 = beneficiaries.iter().map(|b| b.share_percentage).sum();
        require!(
            total_percentage == 100,
            EstateError::InvalidBeneficiaryShares
        );

        estate.beneficiaries = beneficiaries;
        estate.total_beneficiaries = estate.beneficiaries.len() as u8;

        msg!("Updated {} beneficiaries", estate.total_beneficiaries);

        Ok(())
    }

    // Additional estate functions continue here...
    
    pub fn create_rwa(
        ctx: Context<CreateRWA>,
        rwa_type: String,
        name: String,
        description: String,
        value: String,
        metadata_uri: String,
    ) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        let rwa = &mut ctx.accounts.rwa;
        
        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        
        // Check authorization - either owner or multisig
        let is_owner = ctx.accounts.owner.key() == estate.owner;
        let is_multisig = estate.multisig.is_some() && 
            ctx.accounts.owner.key() == estate.multisig.unwrap();
        
        require!(
            is_owner || is_multisig,
            EstateError::UnauthorizedAccess
        );

        // Initialize RWA account
        rwa.estate = estate.key();
        rwa.rwa_type = rwa_type;
        rwa.name = name;
        rwa.description = description;
        rwa.value = value;
        rwa.metadata_uri = metadata_uri.clone();
        rwa.created_at = Clock::get()?.unix_timestamp;
        rwa.is_active = true;
        rwa.rwa_number = estate.total_rwas;
        rwa.current_owner = estate.owner;

        estate.total_rwas += 1;

        msg!("RWA #{} created for Estate #{}", rwa.rwa_number, estate.estate_number);
        
        // Emit RWA added event
        emit!(RWAAdded {
            estate_id: estate.estate_id,
            rwa_id: ctx.accounts.rwa.key(),
            metadata_uri,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn delete_rwa(ctx: Context<DeleteRWA>) -> Result<()> {
        let estate = &ctx.accounts.estate;
        let rwa = &mut ctx.accounts.rwa;
        
        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );
        require!(
            rwa.estate == estate.key(),
            EstateError::UnauthorizedAccess
        );
        require!(rwa.is_active, EstateError::RWAAlreadyDeleted);

        // Mark RWA as inactive (soft delete)
        rwa.is_active = false;

        msg!("RWA #{} deleted from Estate #{}", rwa.rwa_number, estate.estate_number);
        
        // Emit RWA deleted event
        emit!(RWADeleted {
            estate_id: estate.estate_id,
            rwa_id: ctx.accounts.rwa.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn scan_estate_assets(ctx: Context<ScanEstateAssets>) -> Result<()> {
        let estate = &ctx.accounts.estate;
        let asset_summary = &mut ctx.accounts.asset_summary;
        
        // Initialize asset summary
        asset_summary.estate = estate.key();
        asset_summary.scan_time = Clock::get()?.unix_timestamp;
        asset_summary.sol_balance = ctx.accounts.estate.to_account_info().lamports();
        asset_summary.total_rwas = estate.total_rwas;
        asset_summary.active_rwas = 0;
        
        // Count active RWAs (in a real implementation, we'd iterate through them)
        // For now, we'll set this in the frontend by fetching RWAs
        
        msg!(
            "Asset scan complete. SOL: {}, Total RWAs: {}",
            asset_summary.sol_balance,
            asset_summary.total_rwas
        );

        Ok(())
    }

    pub fn trigger_inheritance(ctx: Context<TriggerInheritance>) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        let clock = Clock::get()?;

        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::AlreadyClaimable);

        let inactive_since = estate.last_active + estate.inactivity_period;
        let grace_ends = inactive_since + estate.grace_period;

        require!(
            clock.unix_timestamp > grace_ends,
            EstateError::NotYetClaimable
        );

        estate.is_claimable = true;

        msg!("Estate is now claimable by beneficiaries");
        
        // Emit estate locked event
        emit!(EstateLocked {
            estate_id: estate.estate_id,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn claim_inheritance(
        ctx: Context<ClaimInheritance>,
        beneficiary_index: u8,
    ) -> Result<()> {
        // First, validate the estate state and get needed values
        let estate_key = ctx.accounts.estate.key();
        let beneficiary_key = ctx.accounts.beneficiary.key();
        
        {
            let estate = &ctx.accounts.estate;
            require!(estate.is_claimable, EstateError::NotClaimable);
            require!(
                beneficiary_index < estate.total_beneficiaries,
                EstateError::InvalidBeneficiaryIndex
            );
            
            let beneficiary = &estate.beneficiaries[beneficiary_index as usize];
            require!(
                beneficiary.address == beneficiary_key,
                EstateError::UnauthorizedBeneficiary
            );
            require!(!beneficiary.claimed, EstateError::AlreadyClaimed);
        }

        // Get share percentage before mutable borrow
        let share_percentage = ctx.accounts.estate.beneficiaries[beneficiary_index as usize].share_percentage;

        // Calculate SOL to transfer
        let estate_balance = ctx.accounts.estate.to_account_info().lamports();
        let transferable_balance = estate_balance.saturating_sub(MIN_RENT_BALANCE);
        let sol_share = (transferable_balance as u128)
            .checked_mul(share_percentage as u128)
            .unwrap()
            .checked_div(100)
            .unwrap() as u64;

        // Transfer SOL to beneficiary
        if sol_share > 0 {
            **ctx.accounts.estate.to_account_info().try_borrow_mut_lamports()? -= sol_share;
            **ctx.accounts.beneficiary.to_account_info().try_borrow_mut_lamports()? += sol_share;
        }

        // Initialize claim record
        let claim_record = &mut ctx.accounts.claim_record;
        claim_record.estate = estate_key;
        claim_record.beneficiary = beneficiary_key;
        claim_record.claim_time = Clock::get()?.unix_timestamp;
        claim_record.sol_amount = sol_share;
        claim_record.share_percentage = share_percentage;
        claim_record.tokens_claimed = Vec::new();
        claim_record.nfts_claimed = Vec::new();

        // Mark as claimed
        let estate = &mut ctx.accounts.estate;
        estate.beneficiaries[beneficiary_index as usize].claimed = true;
        estate.total_claims += 1;

        msg!(
            "Beneficiary {} claimed {}% of estate. SOL transferred: {}",
            beneficiary_key,
            share_percentage,
            sol_share
        );
        
        // Emit inheritance claimed event
        emit!(InheritanceClaimed {
            estate_id: estate.estate_id,
            beneficiary: beneficiary_key,
            share_percentage,
            claim_number: estate.total_claims as u64,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn transfer_rwa_ownership(
        ctx: Context<TransferRWAOwnership>,
        rwa_number: u32,
    ) -> Result<()> {
        let estate = &ctx.accounts.estate;
        let rwa = &mut ctx.accounts.rwa;
        let claim_record = &ctx.accounts.claim_record;
        
        require!(estate.is_claimable, EstateError::NotClaimable);
        require!(
            claim_record.estate == estate.key(),
            EstateError::InvalidClaimRecord
        );
        require!(
            claim_record.beneficiary == ctx.accounts.beneficiary.key(),
            EstateError::UnauthorizedBeneficiary
        );
        require!(
            rwa.estate == estate.key(),
            EstateError::InvalidRWA
        );
        require!(
            rwa.rwa_number == rwa_number,
            EstateError::InvalidRWA
        );
        require!(rwa.is_active, EstateError::RWAAlreadyDeleted);

        // Transfer ownership
        rwa.current_owner = ctx.accounts.beneficiary.key();

        msg!(
            "RWA #{} ownership transferred to {}",
            rwa_number,
            ctx.accounts.beneficiary.key()
        );

        Ok(())
    }

    pub fn claim_token(
        ctx: Context<ClaimToken>,
        beneficiary_index: u8,
    ) -> Result<()> {
        let estate = &ctx.accounts.estate;
        let claim_record = &mut ctx.accounts.claim_record;
        
        require!(estate.is_claimable, EstateError::NotClaimable);
        require!(
            beneficiary_index < estate.total_beneficiaries,
            EstateError::InvalidBeneficiaryIndex
        );
        
        let beneficiary = &estate.beneficiaries[beneficiary_index as usize];
        require!(
            beneficiary.address == ctx.accounts.beneficiary.key(),
            EstateError::UnauthorizedBeneficiary
        );
        require!(beneficiary.claimed, EstateError::MustClaimInheritanceFirst);
        
        // Check if this token was already claimed
        let token_mint = ctx.accounts.token_mint.key();
        for token_claim in &claim_record.tokens_claimed {
            require!(
                token_claim.mint != token_mint,
                EstateError::TokenAlreadyClaimed
            );
        }
        
        // Calculate share
        let estate_token_balance = ctx.accounts.estate_token_account.amount;
        let token_share = (estate_token_balance as u128)
            .checked_mul(beneficiary.share_percentage as u128)
            .unwrap()
            .checked_div(100)
            .unwrap() as u64;
        
        if token_share > 0 {
            // Transfer tokens
            let estate_number_bytes = estate.estate_number.to_le_bytes();
            let seeds = &[
                ESTATE_SEED,
                estate.owner.as_ref(),
                estate_number_bytes.as_ref(),
                &[ctx.bumps.estate]
            ];
            let signer = &[&seeds[..]];
            
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.estate_token_account.to_account_info(),
                    to: ctx.accounts.beneficiary_token_account.to_account_info(),
                    authority: ctx.accounts.estate.to_account_info(),
                },
                signer,
            );
            
            token::transfer(cpi_ctx, token_share)?;
            
            // Record the claim
            claim_record.tokens_claimed.push(TokenClaim {
                mint: token_mint,
                amount: token_share,
            });
        }
        
        msg!(
            "Beneficiary {} claimed {} tokens of mint {}",
            beneficiary.address,
            token_share,
            token_mint
        );
        
        Ok(())
    }

    pub fn claim_nft(
        ctx: Context<ClaimNFT>,
        beneficiary_index: u8,
    ) -> Result<()> {
        let estate = &ctx.accounts.estate;
        let claim_record = &mut ctx.accounts.claim_record;
        
        require!(estate.is_claimable, EstateError::NotClaimable);
        require!(
            beneficiary_index < estate.total_beneficiaries,
            EstateError::InvalidBeneficiaryIndex
        );
        
        let beneficiary = &estate.beneficiaries[beneficiary_index as usize];
        require!(
            beneficiary.address == ctx.accounts.beneficiary.key(),
            EstateError::UnauthorizedBeneficiary
        );
        require!(beneficiary.claimed, EstateError::MustClaimInheritanceFirst);
        
        // Check if this NFT was already claimed
        let nft_mint = ctx.accounts.nft_mint.key();
        for nft_claimed in &claim_record.nfts_claimed {
            require!(
                *nft_claimed != nft_mint,
                EstateError::NFTAlreadyClaimed
            );
        }
        
        // Verify estate owns exactly 1 of this NFT
        require!(
            ctx.accounts.estate_nft_account.amount == 1,
            EstateError::InvalidNFTAmount
        );
        
        // Transfer NFT
        let estate_number_bytes = estate.estate_number.to_le_bytes();
        let seeds = &[
            ESTATE_SEED,
            estate.owner.as_ref(),
            estate_number_bytes.as_ref(),
            &[ctx.bumps.estate]
        ];
        let signer = &[&seeds[..]];
        
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.estate_nft_account.to_account_info(),
                to: ctx.accounts.beneficiary_nft_account.to_account_info(),
                authority: ctx.accounts.estate.to_account_info(),
            },
            signer,
        );
        
        token::transfer(cpi_ctx, 1)?;
        
        // Record the claim
        claim_record.nfts_claimed.push(nft_mint);
        
        msg!(
            "Beneficiary {} claimed NFT {}",
            beneficiary.address,
            nft_mint
        );
        
        Ok(())
    }

    pub fn close_estate(ctx: Context<CloseEstate>) -> Result<()> {
        let estate = &ctx.accounts.estate;
        
        require!(estate.is_claimable, EstateError::NotClaimable);
        require!(
            estate.total_claims == estate.total_beneficiaries,
            EstateError::NotAllClaimed
        );

        msg!("Estate #{} closed", estate.estate_number);

        Ok(())
    }

    pub fn emergency_lock(ctx: Context<EmergencyLock>) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        
        require!(!estate.is_locked, EstateError::AlreadyLocked);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );

        estate.is_locked = true;

        msg!("Estate emergency locked");

        Ok(())
    }

    pub fn emergency_unlock(
        ctx: Context<EmergencyUnlock>,
        _verification_code: [u8; 32],
    ) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        
        require!(estate.is_locked, EstateError::NotLocked);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );

        // In production, verify the code
        estate.is_locked = false;

        msg!("Estate emergency unlocked");

        Ok(())
    }

    pub fn initiate_recovery(
        ctx: Context<InitiateRecovery>,
        reason: String,
    ) -> Result<()> {
        let estate = &ctx.accounts.estate;
        let recovery = &mut ctx.accounts.recovery;
        let clock = Clock::get()?;
        
        require!(estate.is_claimable, EstateError::NotClaimable);
        
        // Require estate to be claimable for at least 30 days
        let claimable_duration = clock.unix_timestamp - estate.last_active - estate.inactivity_period - estate.grace_period;
        require!(
            claimable_duration >= 30 * 24 * 60 * 60,
            EstateError::RecoveryTooEarly
        );
        
        // Initialize recovery
        recovery.estate = estate.key();
        recovery.initiator = ctx.accounts.admin.key();
        recovery.initiation_time = clock.unix_timestamp;
        recovery.reason = reason;
        recovery.is_executed = false;
        recovery.execution_time = clock.unix_timestamp + (7 * 24 * 60 * 60); // 7 day delay
        
        msg!("Recovery initiated for Estate #{}", estate.estate_number);
        
        Ok(())
    }

    pub fn execute_recovery(
        ctx: Context<ExecuteRecovery>,
    ) -> Result<()> {
        let recovery = &mut ctx.accounts.recovery;
        let estate = &mut ctx.accounts.estate;
        let clock = Clock::get()?;
        
        require!(!recovery.is_executed, EstateError::RecoveryAlreadyExecuted);
        require!(
            clock.unix_timestamp >= recovery.execution_time,
            EstateError::RecoveryNotReady
        );
        
        // Mark recovery as executed
        recovery.is_executed = true;
        
        // Transfer ownership to recovery address
        estate.owner = ctx.accounts.recovery_address.key();
        estate.is_claimable = false;
        estate.is_locked = false;
        
        // Reset beneficiaries
        estate.beneficiaries.clear();
        estate.total_beneficiaries = 0;
        
        msg!("Estate #{} recovered to {}", estate.estate_number, ctx.accounts.recovery_address.key());
        
        Ok(())
    }
    
    pub fn attach_multisig(
        ctx: Context<AttachMultisig>,
    ) -> Result<()> {
        let estate = &mut ctx.accounts.estate;
        
        require!(!estate.is_locked, EstateError::EstateLocked);
        require!(!estate.is_claimable, EstateError::EstateClaimable);
        require!(
            ctx.accounts.owner.key() == estate.owner,
            EstateError::UnauthorizedAccess
        );
        require!(
            estate.multisig.is_none(),
            EstateError::MultisigAlreadyAttached
        );
        
        estate.multisig = Some(ctx.accounts.multisig.key());
        
        msg!("Multisig attached to Estate #{}", estate.estate_number);
        
        emit!(MultisigAttached {
            estate_id: estate.estate_id,
            multisig_address: ctx.accounts.multisig.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
}

// ===== Structs and Accounts =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub struct Beneficiary {
    pub address: Pubkey,
    pub email_hash: [u8; 32],
    pub share_percentage: u8,
    pub claimed: bool,
    pub notification_sent: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum TradingStrategy {
    Conservative,
    Balanced,
    Aggressive,
}


#[account]
pub struct Estate {
    pub estate_id: Pubkey,
    pub owner: Pubkey,
    pub owner_email_hash: [u8; 32],
    pub last_active: i64,
    pub inactivity_period: i64,
    pub grace_period: i64,
    pub beneficiaries: Vec<Beneficiary>,
    pub total_beneficiaries: u8,
    pub creation_time: i64,
    pub estate_value: u64,
    pub is_locked: bool,
    pub is_claimable: bool,
    pub total_rwas: u32,
    pub estate_number: u64,
    pub total_claims: u8,
    
    // Trading fields (merged from joint account)
    pub trading_enabled: bool,
    pub ai_agent: Option<Pubkey>,
    pub trading_strategy: Option<TradingStrategy>,
    pub human_contribution: u64,
    pub ai_contribution: u64,
    pub trading_value: u64,
    pub trading_profit: i64,
    pub high_water_mark: u64,
    pub human_share: u8, // Percentage for trading profits
    pub ai_share: u8,
    pub stop_loss: Option<u8>,
    pub emergency_delay_hours: u32,
    pub emergency_withdrawal_initiated: bool,
    pub emergency_withdrawal_time: i64,
    pub last_trading_update: i64,
    pub multisig: Option<Pubkey>,
}

impl Estate {
    pub fn check_in(&mut self) -> Result<()> {
        self.last_active = Clock::get()?.unix_timestamp;
        self.is_claimable = false;
        Ok(())
    }
}

// JointAccount struct removed - all functionality merged into Estate

#[account]
pub struct GlobalCounter {
    pub count: u64,
}

#[account]
pub struct RWA {
    pub estate: Pubkey,
    pub rwa_type: String,    // e.g. "realEstate", "vehicle", "jewelry"
    pub name: String,
    pub description: String,
    pub value: String,
    pub metadata_uri: String,
    pub created_at: i64,
    pub is_active: bool,
    pub rwa_number: u32,
    pub current_owner: Pubkey,
}

#[account]
pub struct ClaimRecord {
    pub estate: Pubkey,
    pub beneficiary: Pubkey,
    pub claim_time: i64,
    pub sol_amount: u64,
    pub share_percentage: u8,
    pub tokens_claimed: Vec<TokenClaim>,
    pub nfts_claimed: Vec<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TokenClaim {
    pub mint: Pubkey,
    pub amount: u64,
}

#[account]
pub struct AssetSummary {
    pub estate: Pubkey,
    pub scan_time: i64,
    pub sol_balance: u64,
    pub total_rwas: u32,
    pub active_rwas: u32,
}

#[account]
pub struct Recovery {
    pub estate: Pubkey,
    pub initiator: Pubkey,
    pub initiation_time: i64,
    pub execution_time: i64,
    pub reason: String,
    pub is_executed: bool,
}

// Multi-sig Structs
#[account]
pub struct Multisig {
    pub signers: Vec<Pubkey>,
    pub threshold: u8,
    pub proposal_count: u64,
    pub admin: Pubkey,
    pub pending_admin: Option<Pubkey>,
    pub admin_change_timestamp: i64,
}

#[account]
pub struct Proposal {
    pub multisig: Pubkey,
    pub proposer: Pubkey,
    pub target_estate: Pubkey,
    pub action: ProposalAction,
    pub approvals: Vec<Pubkey>,
    pub executed: bool,
    pub created_at: i64,
    pub proposal_id: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ProposalAction {
    UpdateBeneficiaries { beneficiaries: Vec<Beneficiary> },
    CreateRWA { rwa_type: String, name: String, description: String, value: String, metadata_uri: String },
    DeleteRWA { rwa_id: Pubkey },
    EmergencyLock,
    EmergencyUnlock { verification_code: [u8; 32] },
    EnableTrading { ai_agent: Pubkey, human_share: u8, strategy: TradingStrategy, stop_loss: Option<u8>, emergency_delay_hours: u32 },
}

// ===== Contexts =====

// Multi-sig Context Structs
#[derive(Accounts)]
pub struct InitializeMultisig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + (4 + MAX_SIGNERS * 32) + 1 + 8 + 32 + (1 + 32) + 8,
        seeds = [b"multisig", admin.key().as_ref()],
        bump
    )]
    pub multisig: Account<'info, Multisig>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProposeAdminChange<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    
    #[account(
        mut,
        constraint = multisig.admin == signer.key()
    )]
    pub multisig: Account<'info, Multisig>,
}

#[derive(Accounts)]
pub struct AcceptAdminChange<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    
    #[account(mut)]
    pub multisig: Account<'info, Multisig>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    
    #[account(mut)]
    pub multisig: Account<'info, Multisig>,
    
    #[account(
        init,
        payer = proposer,
        space = 8 + 32 + 32 + 32 + (4 + 256) + (4 + MAX_SIGNERS * 32) + 1 + 8 + 8,
        seeds = [b"proposal", multisig.key().as_ref(), multisig.proposal_count.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveProposal<'info> {
    pub signer: Signer<'info>,
    
    pub multisig: Account<'info, Multisig>,
    
    #[account(
        mut,
        has_one = multisig
    )]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    pub executor: Signer<'info>,
    
    pub multisig: Account<'info, Multisig>,
    
    #[account(
        mut,
        has_one = multisig
    )]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct AttachMultisig<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner
    )]
    pub estate: Account<'info, Estate>,
    
    pub multisig: Account<'info, Multisig>,
}

#[derive(Accounts)]
pub struct InitializeGlobalCounter<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + 8,
        seeds = [COUNTER_SEED],
        bump
    )]
    pub global_counter: Account<'info, GlobalCounter>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEstate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + // discriminator
            32 + // estate_id
            32 + // owner
            32 + // owner_email_hash
            8 + // last_active
            8 + // inactivity_period
            8 + // grace_period
            (4 + 10 * (32 + 32 + 1 + 1 + 1)) + // beneficiaries vector
            1 + // total_beneficiaries
            8 + // creation_time
            8 + // estate_value
            1 + // is_locked
            1 + // is_claimable
            4 + // total_rwas
            8 + // estate_number
            1 + // total_claims
            // Trading fields
            1 + // trading_enabled
            (1 + 32) + // ai_agent Option<Pubkey>
            (1 + 32) + // trading_strategy Option<TradingStrategy>
            8 + // human_contribution
            8 + // ai_contribution
            8 + // trading_value
            8 + // trading_profit
            8 + // high_water_mark
            1 + // human_share
            1 + // ai_share
            (1 + 1) + // stop_loss Option<u8>
            4 + // emergency_delay_hours
            1 + // emergency_withdrawal_initiated
            8 + // emergency_withdrawal_time
            8 + // last_trading_update
            (1 + 32) + // multisig Option<Pubkey>
            100, // buffer
        seeds = [ESTATE_SEED, owner.key().as_ref(), global_counter.count.to_le_bytes().as_ref()],
        bump
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(mut)]
    pub global_counter: Account<'info, GlobalCounter>,
    
    /// CHECK: Estate mint for unique identification
    pub estate_mint: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

// Trading Context Structs

#[derive(Accounts)]
pub struct EnableTrading<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseTrading<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct ResumeTrading<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct ContributeToTrading<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    
    #[account(
        mut,
        constraint = estate.trading_enabled @ EstateError::TradingNotEnabled,
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(mut)]
    pub contributor_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    #[account(
        mut,
        seeds = [
            ESTATE_VAULT_SEED,
            estate.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
    )]
    pub estate_vault: InterfaceAccount<'info, TokenAccountInterface>,
    
    pub token_mint: InterfaceAccount<'info, MintInterface>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitEstateVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner,
        seeds = [ESTATE_SEED, estate.owner.as_ref(), estate.estate_number.to_le_bytes().as_ref()],
        bump
    )]
    pub estate: Account<'info, Estate>,
    /// CHECK: Will be initialized as token account via CPI
    #[account(
        mut,
        seeds = [
            ESTATE_VAULT_SEED,
            estate.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
    )]
    pub estate_vault: UncheckedAccount<'info>,
    pub token_mint: InterfaceAccount<'info, MintInterface>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTradingValue<'info> {
    pub ai_agent: Signer<'info>,
    
    #[account(
        mut,
        constraint = estate.trading_enabled @ EstateError::TradingNotEnabled,
        constraint = estate.ai_agent.is_some() && estate.ai_agent.unwrap() == ai_agent.key() @ EstateError::UnauthorizedAccess,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct DistributeTradingProfits<'info> {
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = estate.trading_enabled @ EstateError::TradingNotEnabled,
        constraint = estate.trading_profit > 0 @ EstateError::NoProfitsToDistribute,
        seeds = [
            ESTATE_SEED,
            estate.owner.as_ref(),
            estate.estate_number.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = estate,
        seeds = [
            ESTATE_VAULT_SEED,
            estate.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
    )]
    pub estate_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = estate.owner,
    )]
    pub human_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = estate.ai_agent.unwrap(),
    )]
    pub ai_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    pub token_mint: InterfaceAccount<'info, MintInterface>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitiateTradingEmergencyWithdrawal<'info> {
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
        constraint = estate.trading_enabled @ EstateError::TradingNotEnabled,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct ExecuteTradingEmergencyWithdrawal<'info> {
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
        constraint = estate.emergency_withdrawal_initiated @ EstateError::EmergencyWithdrawalNotInitiated,
        seeds = [
            ESTATE_SEED,
            estate.owner.as_ref(),
            estate.estate_number.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = estate,
        seeds = [
            ESTATE_VAULT_SEED,
            estate.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
    )]
    pub estate_vault: InterfaceAccount<'info, TokenAccountInterface>,
    
    #[account(mut)]
    pub human_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    pub token_mint: InterfaceAccount<'info, MintInterface>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DepositTokenToEstate<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        mut,
        seeds = [
            ESTATE_SEED,
            estate.owner.as_ref(),
            estate.estate_number.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub estate: Account<'info, Estate>,
    #[account(mut)]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    #[account(
        mut,
        seeds = [
            ESTATE_VAULT_SEED,
            estate.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
    )]
    pub estate_vault: InterfaceAccount<'info, TokenAccountInterface>,
    pub token_mint: InterfaceAccount<'info, MintInterface>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CheckIn<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct UpdateBeneficiaries<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct CreateRWA<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + (4 + 32) + (4 + 128) + (4 + 256) + (4 + 64) + (4 + 256) + 8 + 1 + 4 + 32,
        seeds = [RWA_SEED, estate.key().as_ref(), estate.total_rwas.to_le_bytes().as_ref()],
        bump
    )]
    pub rwa: Account<'info, RWA>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeleteRWA<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub estate: Account<'info, Estate>,
    
    #[account(
        mut,
        has_one = estate,
    )]
    pub rwa: Account<'info, RWA>,
}

#[derive(Accounts)]
pub struct ScanEstateAssets<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub estate: Account<'info, Estate>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 4 + 4,
        seeds = [ASSET_SUMMARY_SEED, estate.key().as_ref()],
        bump
    )]
    pub asset_summary: Account<'info, AssetSummary>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TriggerInheritance<'info> {
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct ClaimInheritance<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    
    #[account(
        mut,
        seeds = [ESTATE_SEED, estate.owner.as_ref(), estate.estate_number.to_le_bytes().as_ref()],
        bump
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(
        init,
        payer = beneficiary,
        space = 8 + 32 + 32 + 8 + 8 + 1 + (4 + 10 * (32 + 8)) + (4 + 10 * 32),
        seeds = [CLAIM_SEED, estate.key().as_ref(), beneficiary.key().as_ref()],
        bump
    )]
    pub claim_record: Account<'info, ClaimRecord>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferRWAOwnership<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    
    pub claim_record: Account<'info, ClaimRecord>,
    
    pub estate: Account<'info, Estate>,
    
    #[account(mut)]
    pub rwa: Account<'info, RWA>,
}

#[derive(Accounts)]
pub struct ClaimToken<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    
    #[account(
        seeds = [ESTATE_SEED, estate.owner.as_ref(), estate.estate_number.to_le_bytes().as_ref()],
        bump
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(
        mut,
        has_one = beneficiary @ EstateError::UnauthorizedBeneficiary,
        has_one = estate @ EstateError::InvalidClaimRecord,
    )]
    pub claim_record: Account<'info, ClaimRecord>,
    
    pub token_mint: InterfaceAccount<'info, MintInterface>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = estate,
    )]
    pub estate_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    #[account(
        init_if_needed,
        payer = beneficiary,
        associated_token::mint = token_mint,
        associated_token::authority = beneficiary,
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimNFT<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    
    #[account(
        seeds = [ESTATE_SEED, estate.owner.as_ref(), estate.estate_number.to_le_bytes().as_ref()],
        bump
    )]
    pub estate: Account<'info, Estate>,
    
    #[account(
        mut,
        has_one = beneficiary @ EstateError::UnauthorizedBeneficiary,
        has_one = estate @ EstateError::InvalidClaimRecord,
    )]
    pub claim_record: Account<'info, ClaimRecord>,
    
    pub nft_mint: InterfaceAccount<'info, MintInterface>,
    
    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = estate,
    )]
    pub estate_nft_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    #[account(
        init_if_needed,
        payer = beneficiary,
        associated_token::mint = nft_mint,
        associated_token::authority = beneficiary,
    )]
    pub beneficiary_nft_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseEstate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        close = authority,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct EmergencyLock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct EmergencyUnlock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner,
    )]
    pub estate: Account<'info, Estate>,
}

#[derive(Accounts)]
pub struct InitiateRecovery<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub estate: Account<'info, Estate>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 8 + 8 + (4 + 256) + 1,
        seeds = [RECOVERY_SEED, estate.key().as_ref()],
        bump
    )]
    pub recovery: Account<'info, Recovery>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteRecovery<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(mut)]
    pub estate: Account<'info, Estate>,
    
    #[account(
        mut,
        has_one = estate,
        seeds = [RECOVERY_SEED, estate.key().as_ref()],
        bump
    )]
    pub recovery: Account<'info, Recovery>,
    
    /// CHECK: The new owner address for the recovered estate
    pub recovery_address: AccountInfo<'info>,
}

// ===== Events =====

// Multi-sig Events
#[event]
pub struct MultisigCreated {
    pub multisig_address: Pubkey,
    pub signers: Vec<Pubkey>,
    pub threshold: u8,
    pub timestamp: i64,
}

#[event]
pub struct AdminChangeProposed {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
    pub execute_after: i64,
    pub timestamp: i64,
}

#[event]
pub struct AdminChangeExecuted {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProposalCreated {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub target_estate: Pubkey,
    pub action: ProposalAction,
    pub timestamp: i64,
}

#[event]
pub struct ProposalApproved {
    pub proposal_id: u64,
    pub approver: Pubkey,
    pub total_approvals: u8,
    pub timestamp: i64,
}

#[event]
pub struct ProposalExecuted {
    pub proposal_id: u64,
    pub executor: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MultisigAttached {
    pub estate_id: Pubkey,
    pub multisig_address: Pubkey,
    pub timestamp: i64,
}

// Estate Events
#[event]
pub struct EstateCreated {
    pub estate_id: Pubkey,
    pub owner: Pubkey,
    pub estate_number: u64,
    pub inactivity_period: i64,
    pub grace_period: i64,
    pub timestamp: i64,
}

#[event]
pub struct BeneficiaryAdded {
    pub estate_id: Pubkey,
    pub beneficiary_address: Pubkey,
    pub share_percentage: u8,
    pub total_beneficiaries: u8,
    pub timestamp: i64,
}

#[event]
pub struct BeneficiaryRemoved {
    pub estate_id: Pubkey,
    pub beneficiary_address: Pubkey,
    pub index: u8,
    pub timestamp: i64,
}

#[event]
pub struct EstateCheckedIn {
    pub estate_id: Pubkey,
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EstateLocked {
    pub estate_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EstateUnlocked {
    pub estate_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct InheritanceClaimed {
    pub estate_id: Pubkey,
    pub beneficiary: Pubkey,
    pub share_percentage: u8,
    pub claim_number: u64,
    pub timestamp: i64,
}

#[event]
pub struct RWAAdded {
    pub estate_id: Pubkey,
    pub rwa_id: Pubkey,
    pub metadata_uri: String,
    pub timestamp: i64,
}

#[event]
pub struct RWADeleted {
    pub estate_id: Pubkey,
    pub rwa_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RecoveryInitiated {
    pub estate_id: Pubkey,
    pub admin: Pubkey,
    pub recovery_address: Pubkey,
    pub execute_after: i64,
    pub timestamp: i64,
}

#[event]
pub struct RecoveryExecuted {
    pub estate_id: Pubkey,
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TradingEnabled {
    pub estate_id: Pubkey,
    pub ai_agent: Pubkey,
    pub human_share: u8,
    pub ai_share: u8,
    pub strategy: TradingStrategy,
    pub timestamp: i64,
}

#[event]
pub struct TradingPaused {
    pub estate_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TradingResumed {
    pub estate_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TradingContribution {
    pub estate_id: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub is_human: bool,
    pub total_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradingValueUpdated {
    pub estate_id: Pubkey,
    pub old_value: u64,
    pub new_value: u64,
    pub profit: i64,
    pub timestamp: i64,
}

#[event]
pub struct ProfitsDistributed {
    pub estate_id: Pubkey,
    pub human_withdrawal: u64,
    pub ai_withdrawal: u64,
    pub remaining_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyWithdrawalInitiated {
    pub estate_id: Pubkey,
    pub initiator: Pubkey,
    pub execute_after: i64,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyWithdrawalExecuted {
    pub estate_id: Pubkey,
    pub human_withdrawal: u64,
    pub ai_withdrawal: u64,
    pub timestamp: i64,
}

// ===== Errors =====

#[error_code]
pub enum EstateError {
    #[msg("Invalid inactivity period. Must be between 24 hours and 300 years")]
    InvalidInactivityPeriod,
    #[msg("Invalid grace period. Must be between 24 hours and 90 days")]
    InvalidGracePeriod,
    #[msg("Estate is locked")]
    EstateLocked,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Estate is already claimable")]
    EstateClaimable,
    #[msg("Too many beneficiaries. Maximum is 10")]
    TooManyBeneficiaries,
    #[msg("Beneficiary shares must sum to 100%")]
    InvalidBeneficiaryShares,
    #[msg("Estate is already claimable")]
    AlreadyClaimable,
    #[msg("Estate is not yet claimable")]
    NotYetClaimable,
    #[msg("Estate is not claimable")]
    NotClaimable,
    #[msg("Invalid beneficiary index")]
    InvalidBeneficiaryIndex,
    #[msg("Unauthorized beneficiary")]
    UnauthorizedBeneficiary,
    #[msg("Inheritance already claimed")]
    AlreadyClaimed,
    #[msg("Estate is already locked")]
    AlreadyLocked,
    #[msg("Estate is not locked")]
    NotLocked,
    #[msg("RWA already deleted")]
    RWAAlreadyDeleted,
    #[msg("Invalid claim record")]
    InvalidClaimRecord,
    #[msg("Invalid RWA")]
    InvalidRWA,
    #[msg("Not all beneficiaries have claimed")]
    NotAllClaimed,
    #[msg("Must claim inheritance first before claiming tokens")]
    MustClaimInheritanceFirst,
    #[msg("Token already claimed")]
    TokenAlreadyClaimed,
    #[msg("NFT already claimed")]
    NFTAlreadyClaimed,
    #[msg("Invalid NFT amount - must be exactly 1")]
    InvalidNFTAmount,
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    #[msg("Invalid token owner")]
    InvalidTokenOwner,
    #[msg("Trading not initialized - must enable trading first")]
    TradingNotInitialized,
    #[msg("Recovery can only be initiated after 30 days of being claimable")]
    RecoveryTooEarly,
    #[msg("Recovery already executed")]
    RecoveryAlreadyExecuted,
    #[msg("Recovery time lock not yet expired")]
    RecoveryNotReady,
    // Trading Errors
    #[msg("Trading already enabled for this estate")]
    TradingAlreadyEnabled,
    #[msg("Trading not enabled for this estate")]
    TradingNotEnabled,
    #[msg("Invalid profit share. Human share must be between 50-100%")]
    InvalidProfitShare,
    #[msg("Invalid emergency delay. Must be between 24 hours and 7 days")]
    InvalidEmergencyDelay,
    #[msg("Unauthorized contributor")]
    UnauthorizedContributor,
    #[msg("No profits to distribute")]
    NoProfitsToDistribute,
    #[msg("Emergency withdrawal already initiated")]
    EmergencyWithdrawalAlreadyInitiated,
    #[msg("Emergency withdrawal not initiated")]
    EmergencyWithdrawalNotInitiated,
    #[msg("Emergency withdrawal delay not yet expired")]
    EmergencyWithdrawalNotReady,
    // Multi-sig Errors
    #[msg("Invalid number of signers. Must be between 2 and 10")]
    InvalidSignerCount,
    #[msg("Invalid threshold. Must be greater than 0 and less than or equal to number of signers")]
    InvalidThreshold,
    #[msg("Unauthorized signer")]
    UnauthorizedSigner,
    #[msg("Proposal already approved by this signer")]
    AlreadyApproved,
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    #[msg("Insufficient approvals to execute proposal")]
    InsufficientApprovals,
    #[msg("Multisig already attached to this estate")]
    MultisigAlreadyAttached,
    #[msg("No pending admin change")]
    NoPendingAdminChange,
    #[msg("Timelock not expired")]
    TimelockNotExpired,
}