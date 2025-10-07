# DefAI Estate - Solidity/EVM Implementation

This directory contains the Solidity smart contracts for DefAI Estate, transpiled from the original Solana/Anchor implementation to work on EVM-compatible blockchains.

## Overview

DefAI Estate is a comprehensive digital estate management platform that enables users to:
- Create and manage digital estates with inheritance planning
- Add beneficiaries with customizable share percentages
- Manage Real World Assets (RWAs) on-chain
- Enable AI-powered trading with profit sharing
- Implement emergency controls and recovery mechanisms
- Use multi-signature governance for critical operations

## Contract Architecture

### Core Contracts

1. **DefAIEstate.sol** - Main contract implementing:
   - Estate creation and management
   - Beneficiary management
   - RWA tracking
   - Trading functionality with AI agents
   - Inheritance triggering and claiming
   - Multi-signature governance
   - Emergency and recovery functions

2. **TokenVault.sol** - Manages ERC20 and ERC721 assets:
   - Deposit tokens and NFTs to estates
   - Claim tokens based on inheritance shares
   - Track token balances per estate
   - Handle NFT custody and distribution

3. **EmergencyManager.sol** - Handles emergency scenarios:
   - Emergency lock/unlock mechanisms
   - Guardian management
   - Multi-approval emergency actions
   - Configurable security parameters

## Key Features

### Estate Management
- Create estates with customizable inactivity and grace periods
- Check-in mechanism to reset inactivity timer
- Estate value tracking through RWAs
- Support for up to 10 beneficiaries per estate

### Trading Features
- AI agent integration for automated trading
- Configurable profit sharing (50-100% human share)
- Three trading strategies: Conservative, Balanced, Aggressive
- Risk management with stop-loss and emergency withdrawal
- Automatic risk limit enforcement

### Inheritance System
- Automatic triggering after inactivity + grace period
- Proportional distribution to beneficiaries
- Support for SOL, ERC20 tokens, and NFTs
- Claim verification and tracking

### Security Features
- Multi-signature governance for critical actions
- Emergency lock/unlock with guardian approvals
- Recovery mechanism for unclaimed estates
- Timelock for admin changes
- Role-based access control

## Deployment

### Prerequisites
```bash
npm install
```

### Configuration
1. Copy `.env.example` to `.env`
2. Add your private key and RPC URLs
3. Configure API keys for contract verification

### Deploy to Networks

```bash
# Local development
npm run node
npm run deploy:localhost

# Testnets
npm run deploy:goerli
npm run deploy:sepolia
npm run deploy:mumbai

# Mainnets
npm run deploy:mainnet
npm run deploy:polygon
npm run deploy:bsc
npm run deploy:avalanche
npm run deploy:arbitrum
npm run deploy:optimism
```

## Testing

Run the comprehensive test suite:
```bash
npm test
```

Generate coverage report:
```bash
npm run coverage
```

## Gas Optimization

The contracts have been optimized for gas efficiency:
- Efficient storage packing
- Minimal external calls
- Optimized loops and conditionals
- Use of events for off-chain data

## Migration from Solana

### Key Differences

1. **Account Model**: 
   - Solana uses Program Derived Addresses (PDAs)
   - EVM uses contract storage mappings

2. **Token Standards**:
   - Solana uses SPL tokens
   - EVM uses ERC20/ERC721 standards

3. **Fees**:
   - Solana charges rent for storage
   - EVM charges gas for computation

4. **Signatures**:
   - Solana supports native multi-sig
   - EVM requires custom implementation

### Feature Parity

All core features from the Solana implementation have been preserved:
- Estate creation and management
- Beneficiary system
- RWA tracking
- Trading with AI agents
- Emergency controls
- Multi-sig governance

## Security Considerations

1. **Auditing**: Contracts should be audited before mainnet deployment
2. **Access Control**: Uses OpenZeppelin's battle-tested implementations
3. **Reentrancy Protection**: All external calls are protected
4. **Integer Overflow**: Uses SafeMath for arithmetic operations
5. **Emergency Pause**: Global pause mechanism for critical situations

## License

MIT License - See LICENSE file for details

## Support

For questions or issues related to the Solidity implementation, please open an issue in the repository.