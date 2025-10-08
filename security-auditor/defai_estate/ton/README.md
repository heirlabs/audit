# DefAI Estate on TON Blockchain

This is the TON blockchain implementation of the DefAI Estate smart contracts, transpiled from the original Solana Rust implementation.

## Contract Overview

### 1. **defai-estate.fc** - Main Estate Contract
- Manages digital estates with inactivity periods and beneficiaries
- Supports trading functionality with AI agents
- Handles deposits, withdrawals, and emergency functions
- Implements multisig proposals for estate management

### 2. **defai-treasury.fc** - Treasury & Multisig Contract  
- Manages platform fees and treasury operations
- Implements multisig functionality for governance
- Handles proposal creation, approval, and execution
- Emergency pause/resume capabilities

### 3. **defai-rwa.fc** - Real World Assets Registry
- Registers and verifies real-world assets
- Manages RWA ownership and transfers
- Supports batch registration of multiple assets
- Handles RWA claims for beneficiaries

## Key Features

### Estate Management
- Create estates with configurable inactivity periods (24h - 300 years)
- Add up to 10 beneficiaries with specific shares
- Automatic estate unlock after inactivity + grace period
- Support for real-world asset registration

### Trading Features
- Enable AI agent trading with profit sharing
- Conservative, Balanced, and Aggressive strategies
- Risk management settings per strategy
- Emergency withdrawal with timelock
- Stop-loss protection

### Multisig Governance
- Threshold-based approval system (min 2 signers)
- Proposal types: withdrawals, signer updates, fee changes
- 48-hour admin change timelock
- 7-day proposal expiry

### Fee Structure
- Estate creation: 0.1 TON
- RWA registration: 0.01 TON per asset
- Platform fee: 2.5% on trading profits

## Deployment

### Prerequisites
```bash
npm install
```

### Environment Setup
Create `.env` file:
```env
TON_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TON_API_KEY=your_api_key
WALLET_MNEMONIC=your wallet mnemonic phrase here
```

### Compile Contracts
```bash
npm run compile
```

### Deploy to Network
```bash
npm run deploy
```

## Contract Methods

### Estate Contract

**Create Estate**
```typescript
op: 0x1001
params: inactivity_period, grace_period, estate_number
```

**Add Beneficiary**
```typescript
op: 0x1002
params: beneficiary_address, share_bps
```

**Enable Trading**
```typescript
op: 0x1007
params: ai_agent, human_share, strategy, stop_loss, emergency_delay
```

**Deposit Funds**
```typescript
op: 0x100a
params: amount (in message value)
```

### Treasury Contract

**Create Proposal**
```typescript
op: 0x2003
params: proposal_type, target, amount, data
```

**Approve Proposal**
```typescript
op: 0x2004
params: proposal_id
```

**Execute Proposal**
```typescript
op: 0x2005
params: proposal_id
```

### RWA Contract

**Register RWA**
```typescript
op: 0x3001
params: estate_id, rwa_type, value, metadata_hash
```

**Verify RWA**
```typescript
op: 0x3002
params: rwa_id
```

**Claim RWA**
```typescript
op: 0x3006
params: rwa_id, estate_claimable
```

## Get Methods

### Estate Info
```func
get_estate_info() -> (estate_number, owner, value, last_active, inactivity_period, grace_period, is_locked, is_claimable)
```

### Trading Status
```func
get_trading_status() -> (enabled: bool)
```

### Treasury Info
```func
get_treasury_info() -> (total_collected, fee_bps, paused, proposal_count)
```

### RWA Info
```func
get_rwa_info(rwa_id) -> (estate_id, type, owner, value, status, exists)
```

## Security Considerations

1. **Multisig Protection**: Critical operations require multiple signatures
2. **Timelock Mechanisms**: Admin changes have 48-hour delay
3. **Emergency Controls**: Pause functionality for crisis situations
4. **Value Validation**: Minimum thresholds for RWA values
5. **Duplicate Prevention**: Checks for duplicate signers and approvals
6. **Expiry Checks**: Proposals expire after 7 days

## Testing

Run the test suite:
```bash
npm test
```

## Gas Optimization

The contracts are optimized for TON's gas model:
- Efficient dictionary operations for beneficiaries and RWAs
- Inline functions for frequently used operations
- Minimal storage updates per transaction
- Batch operations for multiple RWAs

## Migration from Solana

Key differences from the Solana implementation:
- FunC syntax instead of Rust/Anchor
- Message-based architecture vs account-based
- Dictionary storage instead of Borsh serialization
- TON's actor model for contract interactions
- Native multisig through message approvals

## License

This implementation maintains compatibility with the original DefAI Estate architecture while leveraging TON blockchain's unique features for enhanced scalability and lower fees.