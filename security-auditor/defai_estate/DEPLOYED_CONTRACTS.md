# DefAI Estate - Deployed Contracts

## Network: Base Sepolia Testnet
**Chain ID**: 84532  
**RPC URL**: https://sepolia.base.org  
**Explorer**: https://sepolia.basescan.org

## Deployed Contracts

### DefAI Estate Minimal
- **Address**: `0x88b681d4cAE9972Ece0a0c972fBC6511f5BBAE8f`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x88b681d4cAE9972Ece0a0c972fBC6511f5BBAE8f)
- **ABI**: `./artifacts/contracts/DefAIEstateMinimal.sol/DefAIEstateMinimal.json`

### Token Vault
- **Address**: `0x735490Fcf98a487e394648Db98AbD2235a8257BB`
- **Deployer**: `0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x735490Fcf98a487e394648Db98AbD2235a8257BB)
- **ABI**: `./artifacts/contracts/TokenVault.sol/TokenVault.json`

### Emergency Manager
- **Status**: Deployment failed due to nonce issue
- **ABI**: `./artifacts/contracts/EmergencyManager.sol/EmergencyManager.json`

## Shared Tokens (Used by Estate)

### DEFAI Token
- **Address**: `0x86938D567E7c77393aF32eC0E774100d84186558`
- **Explorer Link**: [View on BaseScan](https://sepolia.basescan.org/address/0x86938D567E7c77393aF32eC0E774100d84186558)

## Integration

### Using the ABIs

```javascript
// Example: Connecting to DefAI Estate Minimal
const { ethers } = require('ethers');
const DefAIEstateMinimalABI = require('./artifacts/contracts/DefAIEstateMinimal.sol/DefAIEstateMinimal.json');

const provider = new ethers.providers.JsonRpcProvider('https://sepolia.base.org');
const estateContract = new ethers.Contract(
    '0x88b681d4cAE9972Ece0a0c972fBC6511f5BBAE8f',
    DefAIEstateMinimalABI.abi,
    provider
);
```

### Contract Functions

#### DefAI Estate Minimal
- `initializeEstate()` - Initialize the estate system
- `createProperty()` - Create a new property
- `transferProperty()` - Transfer property ownership
- `getPropertyDetails()` - Get property information

#### Token Vault
- `deposit()` - Deposit tokens
- `withdraw()` - Withdraw tokens
- `getBalance()` - Check balance

## Gas Settings
- Gas Price: ~0.2 gwei
- Gas Limit: Varies by function (100k - 500k)

## Notes
- All contracts deployed on October 7, 2025
- Contracts are NOT upgradeable (consider upgrading to upgradeable pattern)
- Emergency Manager deployment needs to be completed