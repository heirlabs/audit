# DefAI Swap - Solidity Implementation for EVM

This is a Solidity implementation of the DefAI Swap contract, transpiled from the original Solana/Anchor implementation.

## Overview

The DefAI Swap contract enables users to:
- Swap OLD DEFAI or new DEFAI tokens for tiered NFTs with vesting bonuses
- Implement progressive taxation on swaps (5% base, +1% per swap, max 30%)
- Support OG tier 0 holders with special minting privileges
- Manage vesting schedules with cliff periods
- Enable bonus rerolls using Chainlink VRF for randomness

## Key Differences from Solana Version

### 1. Account Model vs UTXO
- Solana uses Program Derived Addresses (PDAs) and account-based storage
- EVM uses contract storage with mappings for user states

### 2. Randomness Implementation
- Solana: Switchboard On-Demand Randomness
- EVM: Chainlink VRF v2 for secure randomness, with fallback to pseudo-random

### 3. Token Standards
- Solana: SPL Token and Token-2022
- EVM: ERC20 for tokens, ERC721 for NFTs

### 4. NFT Minting
- Solana: Metaplex integration
- EVM: Separate ERC721 contract with minter role

## Contract Structure

### Main Contracts

1. **DefaiSwap.sol**: Core swap logic and state management
   - Tax calculation and progressive rates
   - Swap functions for different token types
   - Vesting and claiming mechanisms
   - Admin functions with timelock

2. **DefaiNFT.sol**: ERC721 implementation for bonus NFTs
   - Mintable and burnable
   - Tier-based metadata URIs
   - Role-based access control

3. **IDefaiNFT.sol**: Interface for NFT interactions

## Features

### Tax System
- Initial tax: 5% (500 basis points)
- Increment: 1% per swap (100 basis points)
- Maximum tax: 30% (3000 basis points)
- Reset period: 24 hours of no swaps

### Tier System
| Tier | Name   | Bonus Range |
|------|--------|-------------|
| 0    | OG     | 0%          |
| 1    | Train  | 0-15%       |
| 2    | Boat   | 15-50%      |
| 3    | Plane  | 20-100%     |
| 4    | Rocket | 50-300%     |

### Vesting
- Duration: 90 days
- Cliff period: 2 days
- Linear vesting after cliff

### Security Features
- Admin timelock: 48 hours for critical changes
- Pausable functionality
- Reentrancy protection
- Merkle proof verification for whitelists

## Deployment

### Prerequisites
```bash
npm install @openzeppelin/contracts@^4.9.0
npm install @chainlink/contracts@^0.6.1
```

### Constructor Parameters
```solidity
constructor(
    address _oldDefaiToken,     // OLD DEFAI ERC20 address
    address _defaiToken,        // New DEFAI ERC20 address
    address _nftCollection,     // DefaiNFT contract address
    address _treasury,          // Treasury address for taxes
    uint256[5] _prices,        // Tier prices in token units
    address _vrfCoordinator,   // Chainlink VRF coordinator
    uint64 _subscriptionId,    // VRF subscription ID
    bytes32 _keyHash          // VRF key hash
)
```

### Initialization After Deployment
```solidity
// Set tier supplies and merkle roots
initializeCollection(
    [100, 200, 300, 400, 500],  // Tier supplies
    0x...,                        // OG Tier 0 merkle root
    0x...,                        // Airdrop merkle root
    50                            // OG Tier 0 reserved supply
);

// Grant minter role to swap contract
nftContract.grantRole(MINTER_ROLE, swapContract);
```

## Usage Examples

### Initialize User Tax State
```solidity
swapContract.initializeUserTax();
```

### Swap DEFAI for NFT
```solidity
// Approve tokens first
defaiToken.approve(swapContract, amount);

// Perform swap
swapContract.swapDefaiForNft(
    2,        // Tier (0-4)
    12345     // Token ID
);
```

### Claim Vested Tokens
```solidity
swapContract.claimVested(tokenId);
```

### Redeem NFT
```solidity
swapContract.redeem(tokenId);
```

## Testing Recommendations

1. Test tax calculations and reset mechanism
2. Verify merkle proof validation for whitelists
3. Test vesting calculations and cliff periods
4. Verify VRF integration and fallback mechanism
5. Test admin functions and timelock
6. Verify reentrancy protection
7. Test pause/unpause functionality

## Gas Optimization Considerations

1. Use storage pointers for struct modifications
2. Pack struct variables efficiently
3. Use events for off-chain data tracking
4. Consider batch operations for multiple swaps

## Security Considerations

1. Ensure proper access control on NFT minting
2. Validate all merkle proofs correctly
3. Handle VRF failures gracefully
4. Implement proper decimal handling for token amounts
5. Audit randomness generation for fairness
6. Test all edge cases around vesting calculations

## Migration Notes

When migrating from Solana:
1. Token decimals may differ (Solana uses 6, EVM typically uses 18)
2. Update merkle roots for EVM addresses
3. Configure Chainlink VRF subscription
4. Deploy and configure NFT contract separately
5. Set appropriate gas limits for VRF callbacks

## License

MIT