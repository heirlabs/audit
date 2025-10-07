# DeFAI Ecosystem Integration Guide

## Overview
All DeFAI contracts are deployed on Base Sepolia testnet and use shared token addresses for seamless integration.

## Quick Reference - Contract Addresses

### Shared Tokens (Used by ALL Contracts)
```javascript
const TOKENS = {
    DEFAI: "0x86938D567E7c77393aF32eC0E774100d84186558",      // Primary DEFAI token
    OLD_DEFAI: "0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3",  // Old DEFAI for migration
    NFT: "0x928AC6730A2A07D7D68F79b459E2256B38Ac0ecF"         // DefAI NFT collection
};
```

### Upgradeable Contracts (RECOMMENDED)
```javascript
const CONTRACTS = {
    STAKING: "0x09760F6877801eDadE5f2EA24Fc2438E8c8D86A7",    // DefAI Staking Proxy
    APP_FACTORY: "0x4Aa853Ea627dA3136EECdA7cA0767163f82549f9", // App Factory Proxy
};
```

### Non-Upgradeable Contracts
```javascript
const LEGACY_CONTRACTS = {
    SWAP: "0x14D97E2FAB4Be5bC8B7D0cd76F395fB5e6Ca140e",       // DefAI Swap
    ESTATE_MINIMAL: "0x88b681d4cAE9972Ece0a0c972fBC6511f5BBAE8f", // Estate Minimal
    TOKEN_VAULT: "0x735490Fcf98a487e394648Db98AbD2235a8257BB"     // Token Vault
};
```

## ABI Locations

Each project contains compiled ABIs in the `artifacts` directory:

```bash
# DefAI Estate
defai_estate/artifacts/contracts/DefAIEstateMinimal.sol/DefAIEstateMinimal.json
defai_estate/artifacts/contracts/TokenVault.sol/TokenVault.json

# DefAI Swap
defai_swap/artifacts/contracts/DefaiSwap.sol/DefaiSwap.json
defai_swap/artifacts/contracts/DefaiNFT.sol/DefaiNFT.json

# DefAI App Factory
defai_app_factory/artifacts/contracts/DefaiAppFactory.sol/DefaiAppFactory.json
defai_staking_evm/artifacts/contracts/DefaiAppFactoryUpgradeable.sol/DefaiAppFactoryUpgradeable.json

# DefAI Staking
defai_staking_evm/artifacts/contracts/DeFAIStaking.sol/DeFAIStaking.json
defai_staking_evm/artifacts/contracts/DeFAIStakingUpgradeable.sol/DeFAIStakingUpgradeable.json
```

## Integration Examples

### 1. Basic Setup (ethers.js v5)

```javascript
const { ethers } = require('ethers');

// Connect to Base Sepolia
const provider = new ethers.providers.JsonRpcProvider('https://sepolia.base.org');

// Load ABIs
const StakingABI = require('./defai_staking_evm/artifacts/contracts/DeFAIStakingUpgradeable.sol/DeFAIStakingUpgradeable.json');
const FactoryABI = require('./defai_staking_evm/artifacts/contracts/DefaiAppFactoryUpgradeable.sol/DefaiAppFactoryUpgradeable.json');
const SwapABI = require('./defai_swap/artifacts/contracts/DefaiSwap.sol/DefaiSwap.json');

// Create contract instances
const stakingContract = new ethers.Contract(
    '0x09760F6877801eDadE5f2EA24Fc2438E8c8D86A7',
    StakingABI.abi,
    provider
);

const factoryContract = new ethers.Contract(
    '0x4Aa853Ea627dA3136EECdA7cA0767163f82549f9',
    FactoryABI.abi,
    provider
);

const swapContract = new ethers.Contract(
    '0x14D97E2FAB4Be5bC8B7D0cd76F395fB5e6Ca140e',
    SwapABI.abi,
    provider
);
```

### 2. Common Integration Flows

#### Staking Flow
```javascript
// 1. Approve DEFAI tokens for staking
const defaiToken = new ethers.Contract(TOKENS.DEFAI, ERC20_ABI, signer);
await defaiToken.approve(CONTRACTS.STAKING, amount);

// 2. Stake tokens
await stakingContract.stakeTokens(amount);

// 3. Check rewards
const rewards = await stakingContract.getPendingRewards(userAddress);

// 4. Claim rewards
await stakingContract.claimRewards();
```

#### App Purchase Flow
```javascript
// 1. Approve DEFAI for app purchase
await defaiToken.approve(CONTRACTS.APP_FACTORY, appPrice);

// 2. Purchase app
await factoryContract.purchaseApp(appId);

// 3. Check access
const hasAccess = await factoryContract.getUserAccess(userAddress, appId);

// 4. Leave review (if purchased)
await factoryContract.addReview(appId, rating, "ipfs://review-cid");
```

#### Token Swap Flow
```javascript
// 1. Approve OLD DEFAI tokens
const oldDefaiToken = new ethers.Contract(TOKENS.OLD_DEFAI, ERC20_ABI, signer);
await oldDefaiToken.approve(LEGACY_CONTRACTS.SWAP, amount);

// 2. Swap for new DEFAI
await swapContract.swapTokens(amount);
```

### 3. Admin Functions (Upgradeable Contracts Only)

```javascript
// Connect as admin
const adminSigner = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
const stakingAdmin = stakingContract.connect(adminSigner);

// Pause operations
await stakingAdmin.pause();

// Blacklist user
await stakingAdmin.blacklistUser(userAddress);

// Update token address
await stakingAdmin.updateTokens(newDefaiAddress, newOldDefaiAddress);

// Unpause
await stakingAdmin.unpause();
```

## Network Configuration

### Base Sepolia Testnet
```javascript
const networkConfig = {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18
    }
};
```

### Gas Settings
```javascript
const txConfig = {
    gasPrice: ethers.utils.parseUnits('0.2', 'gwei'), // ~0.2 gwei
    gasLimit: 300000 // Adjust based on function
};
```

## Token Standards

### DEFAI Token (ERC20)
- Decimals: 6
- Parse amounts: `ethers.utils.parseUnits(amount, 6)`
- Format amounts: `ethers.utils.formatUnits(amount, 6)`

### App NFTs (ERC1155)
- Token ID = App ID
- Balance = 1 (owns) or 0 (doesn't own)

## Error Handling

```javascript
try {
    const tx = await contract.someFunction();
    const receipt = await tx.wait();
    console.log('Success:', receipt.transactionHash);
} catch (error) {
    if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
        console.error('Transaction will revert - check requirements');
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
        console.error('Not enough ETH for gas');
    } else if (error.reason) {
        console.error('Contract error:', error.reason);
    }
}
```

## Events to Monitor

### Staking Events
- `Staked(address user, uint256 amount, Tier tier)`
- `Unstaked(address user, uint256 amount)`
- `RewardsClaimed(address user, uint256 amount)`

### App Factory Events
- `AppRegistered(uint256 appId, address creator, uint256 price)`
- `AppPurchased(uint256 appId, address buyer, uint256 price)`
- `AppReviewed(uint256 appId, address reviewer, uint8 rating)`

### Swap Events
- `TokensSwapped(address user, uint256 oldAmount, uint256 newAmount)`

## Security Considerations

1. **Always use proxy addresses** for upgradeable contracts
2. **Check allowances** before approving more tokens
3. **Verify contract addresses** before interacting
4. **Monitor gas prices** on Base Sepolia
5. **Handle revert reasons** in try/catch blocks

## Testing on Base Sepolia

### Get Test ETH
- Faucet: https://www.alchemy.com/faucets/base-sepolia
- Bridge from Sepolia: https://bridge.base.org/

### Get Test DEFAI Tokens
Contact admin wallet for test tokens:
- Admin: `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`

## Support & Documentation

- **Deployment Docs**: Check `DEPLOYED_CONTRACTS.md` in each project directory
- **Contract Source**: Available in `contracts/` directory of each project
- **ABIs**: Located in `artifacts/contracts/` after compilation

## Common Issues & Solutions

### Issue: "Insufficient Allowance"
**Solution**: Approve tokens before calling contract functions
```javascript
await token.approve(contractAddress, amount);
```

### Issue: "Contract Paused"
**Solution**: Admin needs to unpause the contract
```javascript
await contract.unpause(); // Admin only
```

### Issue: "User Blacklisted"
**Solution**: Admin needs to whitelist the user
```javascript
await contract.whitelistUser(address); // Admin only
```

### Issue: "Nonce Already Used"
**Solution**: Wait for pending transactions or reset nonce
```javascript
const nonce = await signer.getTransactionCount('pending');
```