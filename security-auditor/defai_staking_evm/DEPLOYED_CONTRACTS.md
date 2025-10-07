# DefAI Staking EVM - Deployed Contracts

## Network: Base Sepolia Testnet
**Chain ID**: 84532  
**RPC URL**: https://sepolia.base.org  
**Explorer**: https://sepolia.basescan.org

## Deployed Contracts

### DefAI Staking (Non-Upgradeable)
- **Address**: `0xEa96C0C145fc548Eac88251F93B21f13EE25EDfA`
- **Deployer**: `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0xEa96C0C145fc548Eac88251F93B21f13EE25EDfA)
- **ABI**: `./artifacts/contracts/DeFAIStaking.sol/DeFAIStaking.json`
- **Note**: Initial deployment with allowance issue

### Mock DEFAI Token (Test Deployment)
- **Address**: `0x6bC9800FAacd5F64205B43c4818b6a91fc45C3E5`
- **Deployer**: `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x6bC9800FAacd5F64205B43c4818b6a91fc45C3E5)

### DefAI Staking Upgradeable (RECOMMENDED)
- **Proxy Address**: `0x09760F6877801eDadE5f2EA24Fc2438E8c8D86A7`
- **Implementation**: `0x66174cD6E295f16e63b395744f452a82f05e8523`
- **Deployer**: `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x09760F6877801eDadE5f2EA24Fc2438E8c8D86A7)
- **ABI**: `./artifacts/contracts/DeFAIStakingUpgradeable.sol/DeFAIStakingUpgradeable.json`

## Shared Tokens (Used by Staking)

### DEFAI Token
- **Address**: `0x86938D567E7c77393aF32eC0E774100d84186558`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x86938D567E7c77393aF32eC0E774100d84186558)
- **Note**: Primary DEFAI token used across all contracts

### OLD DEFAI Token
- **Address**: `0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3)
- **Note**: For migration support

## Staking Tiers & APY

### Gold Tier
- **Minimum**: 10M DEFAI (10,000,000)
- **Maximum**: 99.99M DEFAI (99,999,999)
- **APY**: 0.5% (50 basis points)

### Titanium Tier
- **Minimum**: 100M DEFAI (100,000,000)
- **Maximum**: 999.99M DEFAI (999,999,999)
- **APY**: 0.75% (75 basis points)

### Infinite Tier
- **Minimum**: 1B DEFAI (1,000,000,000)
- **Maximum**: No limit
- **APY**: 1% (100 basis points)

## Integration

### Using the Upgradeable Staking (RECOMMENDED)

```javascript
// Example: Connecting to DefAI Staking Upgradeable
const { ethers } = require('ethers');
const StakingABI = require('./artifacts/contracts/DeFAIStakingUpgradeable.sol/DeFAIStakingUpgradeable.json');

const provider = new ethers.providers.JsonRpcProvider('https://sepolia.base.org');
const stakingContract = new ethers.Contract(
    '0x09760F6877801eDadE5f2EA24Fc2438E8c8D86A7', // Use proxy address
    StakingABI.abi,
    provider
);
```

### Main Functions

#### Staking Operations
- `stakeTokens(uint256 amount)` - Stake DEFAI tokens
- `unstakeTokens(uint256 amount)` - Unstake tokens (after lock period)
- `claimRewards()` - Claim accumulated rewards
- `emergencyWithdraw()` - Emergency withdraw (forfeits rewards)

#### Escrow Management
- `fundEscrow(uint256 amount)` - Fund the rewards escrow

#### View Functions
- `getUserStakeInfo(address user)` - Get user's staking details
- `getPendingRewards(address user)` - Check pending rewards
- `escrowBalance()` - Check escrow balance
- `totalStaked()` - Total staked across all users
- `totalUsers()` - Number of staking users

#### Admin Functions (Upgradeable Version)
- `pause()` - Pause all staking operations
- `unpause()` - Resume operations
- `blacklistUser(address user)` - Block user from staking
- `whitelistUser(address user)` - Unblock user
- `updateTokens(address newDefai, address newOldDefai)` - Update token addresses

## Roles (Upgradeable Version)

### Access Control Roles
- `ADMIN_ROLE` - General administration
- `PAUSER_ROLE` - Pause/unpause operations
- `UPGRADER_ROLE` - Upgrade contract implementation
- `BLACKLIST_ROLE` - Manage user blacklist

### Current Admin
- `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C` (All roles)

## Important Parameters

### Lock Period
- **Initial Lock**: 7 days
- **Admin Timelock**: 48 hours

### Token Decimals
- **DEFAI**: 6 decimals
- **Calculations**: Use `ethers.utils.parseUnits(amount, 6)`

## Contract State

### Escrow
- **Current Balance**: 0 DEFAI (needs funding)
- **Total Distributed**: 0 DEFAI

### Statistics
- **Total Staked**: 0 DEFAI
- **Total Users**: 0

## Gas Settings
- Gas Price: ~0.2 gwei
- Gas Limit: Varies by function (100k - 300k)

## Important Notes
1. **Use the upgradeable version** for production
2. **Proxy address** must be used for all interactions
3. **Escrow needs funding** before rewards can be claimed
4. **7-day lock period** applies to all new stakes
5. Rewards calculated per second based on tier APY

## Deployment Info
- **Date**: October 7, 2025
- **Initial Deployment**: Had allowance issues
- **Upgradeable Deployment**: `deployment-staking-upgradeable-1759845996322.json`

## Next Steps
1. Fund the escrow with DEFAI tokens for rewards
2. Transfer admin roles to multisig for security
3. Set up monitoring for staking events
4. Consider implementing auto-compounding feature