# DefAI Swap - Deployed Contracts

## Network: Base Sepolia Testnet
**Chain ID**: 84532  
**RPC URL**: https://sepolia.base.org  
**Explorer**: https://sepolia.basescan.org

## Deployed Contracts

### OLD DEFAI Token (Mock)
- **Address**: `0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3)
- **ABI**: `./artifacts/contracts/MockERC20.sol/MockERC20.json`

### DEFAI Token (Mock)
- **Address**: `0x86938D567E7c77393aF32eC0E774100d84186558`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x86938D567E7c77393aF32eC0E774100d84186558)
- **ABI**: `./artifacts/contracts/MockERC20.sol/MockERC20.json`
- **Note**: This is the primary DEFAI token used across all contracts

### DefAI NFT Contract
- **Address**: `0x928AC6730A2A07D7D68F79b459E2256B38Ac0ecF`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x928AC6730A2A07D7D68F79b459E2256B38Ac0ecF)
- **ABI**: `./artifacts/contracts/DefaiNFT.sol/DefaiNFT.json`

### DefAI Swap Contract
- **Address**: `0x14D97E2FAB4Be5bC8B7D0cd76F395fB5e6Ca140e`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x14D97E2FAB4Be5bC8B7D0cd76F395fB5e6Ca140e)
- **ABI**: `./artifacts/contracts/DefaiSwap.sol/DefaiSwap.json`

## Configuration

### Treasury
- **Address**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`

### Chainlink VRF (Base Sepolia)
- **VRF Coordinator**: `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634`
- **Subscription Required**: Yes (needs to be created and funded)

## Integration

### Using the ABIs

```javascript
// Example: Connecting to DefAI Swap
const { ethers } = require('ethers');
const DefaiSwapABI = require('./artifacts/contracts/DefaiSwap.sol/DefaiSwap.json');

const provider = new ethers.providers.JsonRpcProvider('https://sepolia.base.org');
const swapContract = new ethers.Contract(
    '0x14D97E2FAB4Be5bC8B7D0cd76F395fB5e6Ca140e',
    DefaiSwapABI.abi,
    provider
);
```

### Main Functions

#### DefAI Swap
- `swapTokens(uint256 amount)` - Swap OLD DEFAI for new DEFAI
- `initializeCollection(...)` - Initialize NFT collection
- `requestCollectionReveal()` - Request VRF for reveal
- `mintNFT(address to, uint256 collectionId)` - Mint NFT from collection
- `toggleTradingEnabled()` - Enable/disable trading
- `updateTreasury(address newTreasury)` - Update treasury address

#### DefAI NFT
- `mint(address to, uint256 tokenId)` - Mint new NFT (requires MINTER_ROLE)
- `burn(uint256 tokenId)` - Burn NFT
- `setBaseURI(string uri)` - Set base URI for metadata

## Token Information

### OLD DEFAI
- Symbol: `OLDDEFAI`
- Decimals: 6
- Initial Supply: 10,000 tokens to deployer

### DEFAI
- Symbol: `DEFAI`
- Decimals: 6
- Initial Supply: 10,000 tokens to deployer

## Permissions

### Swap Contract
- Has MINTER_ROLE on NFT contract
- Collection initialized during deployment

### NFT Contract
- MINTER_ROLE granted to Swap contract

## Gas Settings
- Gas Price: ~1 gwei
- Gas Limit: Varies by function (100k - 500k)

## Next Steps
1. Create Chainlink VRF subscription
2. Fund subscription with LINK tokens
3. Add swap contract as VRF consumer
4. Enable trading when ready

## Deployment Info
- **Date**: October 7, 2025
- **Deployment File**: `deployment-base-sepolia.json`
- **Test Tokens**: 10,000 of each token distributed to deployer