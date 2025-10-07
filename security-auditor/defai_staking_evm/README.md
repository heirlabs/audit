# DeFAI Staking Smart Contract (EVM)

This is the EVM-compatible version of the DeFAI Staking smart contract, transpiled from the original Solana/Rust implementation.

## Overview

The DeFAI Staking contract allows users to stake DEFAI tokens and earn rewards based on tiered APY rates. The contract implements a three-tier system (Gold, Titanium, Infinite) with increasing rewards based on the staked amount.

## Features

### Core Functionality
- **Tiered Staking**: Three tiers with different minimum requirements and APY rates
  - Gold: 10M-99.99M DEFAI (0.5% APY)
  - Titanium: 100M-999.99M DEFAI (0.75% APY)
  - Infinite: 1B+ DEFAI (1% APY)
- **Reward System**: Time-based reward accrual with compound option
- **Lock Period**: 7-day initial lock period for new stakes
- **Unstaking Penalties**: 
  - < 30 days: 2% penalty
  - 30-90 days: 1% penalty
  - > 90 days: No penalty
- **Escrow Management**: Separate reward pool funded by admin or penalty fees

### Security Features
- **Pausable**: Contract can be paused in case of emergency
- **Reentrancy Protection**: All state-changing functions are protected
- **Timelock**: 48-hour timelock for critical admin functions
- **Ownable**: Two-step ownership transfer process
- **Safe Math**: Uses OpenZeppelin's SafeERC20 for token transfers

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update the environment variables:
- `PRIVATE_KEY`: Your deployment wallet private key
- `DEFAI_TOKEN_ADDRESS`: Address of the DEFAI token (or leave empty to deploy mock)
- RPC URLs for various networks
- API keys for contract verification

## Deployment

### Local Testing
```bash
# Start local node
npx hardhat node

# Deploy to local network
npx hardhat run scripts/deploy.js --network localhost
```

### Testnet Deployment
```bash
# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia

# Deploy to BSC Testnet
npx hardhat run scripts/deploy.js --network bscTestnet

# Deploy to Mumbai (Polygon testnet)
npx hardhat run scripts/deploy.js --network mumbai
```

### Mainnet Deployment
```bash
# Deploy to Ethereum Mainnet
npx hardhat run scripts/deploy.js --network ethereum

# Deploy to BSC
npx hardhat run scripts/deploy.js --network bsc

# Deploy to Polygon
npx hardhat run scripts/deploy.js --network polygon
```

## Contract Verification

After deployment, verify the contract on the block explorer:

```bash
npx hardhat verify --network <network-name> <contract-address> <constructor-args>
```

Example:
```bash
npx hardhat verify --network sepolia 0x123... 0x456...
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run with coverage
npm run coverage

# Run specific test file
npx hardhat test test/DeFAIStaking.test.js
```

## Usage

### For Users

1. **Stake Tokens**:
```javascript
// Approve staking contract
await defaiToken.approve(stakingAddress, amount);
// Stake tokens
await staking.stakeTokens(amount);
```

2. **Check Stake Info**:
```javascript
const info = await staking.getUserStakeInfo(userAddress);
// Returns: stakedAmount, rewardsEarned, rewardsClaimed, tier, lockedUntil, pendingRewards
```

3. **Claim Rewards**:
```javascript
await staking.claimRewards();
```

4. **Compound Rewards**:
```javascript
await staking.compoundRewards();
```

5. **Unstake Tokens**:
```javascript
await staking.unstakeTokens(amount);
```

### For Admins

1. **Fund Escrow**:
```javascript
await defaiToken.approve(stakingAddress, amount);
await staking.fundEscrow(amount);
```

2. **Pause/Unpause Contract**:
```javascript
await staking.pause();
await staking.unpause();
```

3. **Transfer Ownership** (with 48-hour timelock):
```javascript
// Initiate transfer
await staking.initiateOwnershipTransfer(newOwnerAddress);
// After 48 hours, new owner accepts
await staking.connect(newOwner).acceptOwnershipTransfer();
```

## Contract Addresses

Deployment addresses will be saved in `./deployments/<network>_deployment.json` after each deployment.

## Gas Optimization

The contract is optimized for gas efficiency:
- Optimizer enabled with 200 runs
- Efficient storage packing
- Minimal external calls
- Batch operations where possible

## Security Considerations

1. **Audits**: Contract should be audited before mainnet deployment
2. **Timelock**: All critical admin functions have 48-hour timelock
3. **Multisig**: Recommend using multisig wallet for owner account
4. **Monitoring**: Set up monitoring for unusual activities
5. **Emergency Pause**: Contract can be paused if issues are detected

## Differences from Solana Version

While maintaining the core functionality, some adaptations were made for EVM:

1. **Account Model**: EVM uses mapping instead of Solana's account structure
2. **Authority**: Uses OpenZeppelin's Ownable instead of Solana's authority model
3. **Token Standard**: Uses ERC20 instead of SPL tokens
4. **PDA**: No Program Derived Addresses; uses contract storage
5. **Decimals**: Maintains 6 decimals for compatibility

## License

MIT