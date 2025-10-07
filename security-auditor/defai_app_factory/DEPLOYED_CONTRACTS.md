# DefAI App Factory - Deployed Contracts

## Network: Base Sepolia Testnet
**Chain ID**: 84532  
**RPC URL**: https://sepolia.base.org  
**Explorer**: https://sepolia.basescan.org

## Deployed Contracts

### Mock DEFAI Token
- **Address**: `0x9c1bbe1D498f1add355D3176259AFa8bd46f89C5`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x9c1bbe1D498f1add355D3176259AFa8bd46f89C5)
- **ABI**: `./artifacts/contracts/MockDefaiToken.sol/MockDefaiToken.json`
- **Note**: This was a test deployment - use shared DEFAI token instead

### DefAI App Factory (Non-Upgradeable)
- **Address**: `0xe12dB2c3A287C3FC681F9E45E433aC4eE1ce75B4`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0xe12dB2c3A287C3FC681F9E45E433aC4eE1ce75B4)
- **ABI**: `./artifacts/contracts/DefaiAppFactory.sol/DefaiAppFactory.json`

### DefAI App Factory Upgradeable (RECOMMENDED)
- **Proxy Address**: `0x4Aa853Ea627dA3136EECdA7cA0767163f82549f9`
- **Implementation**: `0xe98Bd0393494CcA2a64A259C79F1c8b7Bbc0a22e`
- **Deployer**: `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x4Aa853Ea627dA3136EECdA7cA0767163f82549f9)
- **ABI**: `../defai_staking_evm/artifacts/contracts/DefaiAppFactoryUpgradeable.sol/DefaiAppFactoryUpgradeable.json`

## Shared DEFAI Token (Used by Factory)
- **Address**: `0x86938D567E7c77393aF32eC0E774100d84186558`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x86938D567E7c77393aF32eC0E774100d84186558)
- **Note**: This is the primary DEFAI token used across all contracts

## Configuration

### Treasury
- **Address**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26` (Non-upgradeable)
- **Address**: `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C` (Upgradeable)

### Platform Fee
- **Rate**: 20% (2000 basis points)
- **Adjustable**: Yes (by admin)

## Integration

### Using the Upgradeable Factory (RECOMMENDED)

```javascript
// Example: Connecting to DefAI App Factory Upgradeable
const { ethers } = require('ethers');
const FactoryABI = require('../defai_staking_evm/artifacts/contracts/DefaiAppFactoryUpgradeable.sol/DefaiAppFactoryUpgradeable.json');

const provider = new ethers.providers.JsonRpcProvider('https://sepolia.base.org');
const factoryContract = new ethers.Contract(
    '0x4Aa853Ea627dA3136EECdA7cA0767163f82549f9', // Use proxy address
    FactoryABI.abi,
    provider
);
```

### Main Functions

#### App Registration & Management
- `registerApp(uint256 price, uint256 maxSupply, string metadataUri)` - Register new app
- `purchaseApp(uint256 appId)` - Purchase app access
- `deactivateApp(uint256 appId)` - Admin: deactivate app

#### Reviews
- `addReview(uint256 appId, uint8 rating, string commentCid)` - Add review (must own app)
- `updateReview(uint256 appId, uint8 rating, string commentCid)` - Update existing review

#### Refunds
- `processRefund(uint256 appId, address user, string reason)` - Process refund (creator only)

#### Admin Functions (Upgradeable Version)
- `pause()` - Pause all contract operations
- `unpause()` - Resume operations
- `blacklistUser(address user)` - Block user from contract
- `whitelistUser(address user)` - Unblock user
- `updateTokenAddress(address newToken)` - Change DEFAI token address
- `updateTreasury(address newTreasury)` - Change treasury address
- `updatePlatformFee(uint16 newFeeBps)` - Adjust platform fee

#### View Functions
- `getAppInfo(uint256 appId)` - Get app details
- `getUserAccess(address user, uint256 appId)` - Check user access
- `getAppAverageRating(uint256 appId)` - Get average rating
- `getCreatorApps(address creator)` - List creator's apps
- `getUserPurchasedApps(address user)` - List user's purchased apps
- `getTotalApps()` - Get total registered apps

## Roles (Upgradeable Version)

### Access Control Roles
- `ADMIN_ROLE` - General administration
- `PAUSER_ROLE` - Pause/unpause operations
- `UPGRADER_ROLE` - Upgrade contract implementation
- `BLACKLIST_ROLE` - Manage user blacklist
- `TREASURY_ROLE` - Update treasury address

### Current Admin
- `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C` (All roles)

## ERC1155 Token Standard
- Apps are represented as ERC1155 tokens
- Token ID = App ID
- Balance = 1 if user has access, 0 otherwise

## Gas Settings
- Gas Price: ~0.2 gwei
- Gas Limit: Varies by function (100k - 300k)

## Important Notes
1. **Use the upgradeable version** for production
2. **Proxy address** must be used for all interactions
3. **Implementation** can be upgraded without changing proxy
4. Test app registered with ID 1 during deployment

## Deployment Info
- **Date**: October 7, 2025
- **Test Deployment**: `deployment-base-sepolia-1759844978943.json`
- **Upgradeable Deployment**: `../defai_staking_evm/deployment-factory-upgradeable-1759846109911.json`