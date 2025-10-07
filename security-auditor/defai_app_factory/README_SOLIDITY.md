# DefaiAppFactory - Solidity/EVM Implementation

This is a complete Solidity implementation of the Solana `defai_app_factory` program, adapted for EVM-compatible blockchains.

## Overview

The DefaiAppFactory contract manages a decentralized app marketplace where:
- Creators can register apps with custom pricing
- Users can purchase access to apps using DEFAI tokens
- App access is represented as non-transferable ERC1155 tokens (SFTs)
- Users can submit reviews for apps they own
- Platform collects fees from each purchase
- Creators can issue refunds if needed

## Key Differences from Solana Version

### 1. **Account Model vs Storage Model**
- **Solana**: Uses separate PDA accounts for each data structure
- **EVM**: Uses contract storage with mappings and structs

### 2. **Token Standards**
- **Solana**: Custom SPL token minting for each app
- **EVM**: Single ERC1155 contract where each token ID represents an app

### 3. **Authority Management**
- **Solana**: 2-step authority transfer with pending state
- **EVM**: Uses OpenZeppelin's Ownable2Step for secure ownership transfer

### 4. **Access Control**
- **Solana**: PDAs provide built-in access control
- **EVM**: Explicit modifier checks and ownership validation

### 5. **Gas Optimization**
- **Solana**: Stack overflow issues handled with separate functions
- **EVM**: No stack limitations, but gas optimization through efficient storage patterns

## Contract Architecture

### Main Contract: `DefaiAppFactory.sol`
- Inherits from:
  - `ERC1155`: For SFT functionality
  - `Ownable2Step`: For secure ownership management
  - `ReentrancyGuard`: For protection against reentrancy attacks
  - `Pausable`: For emergency pause functionality

### Key Components:
1. **App Registration System**: Register and manage apps
2. **Purchase System**: Handle DEFAI token payments and SFT minting
3. **Review System**: User reviews with ratings and IPFS comments
4. **Refund System**: Creator-initiated refunds
5. **Platform Management**: Fee updates and treasury management

## Deployment

### Prerequisites
```bash
npm install --save-dev hardhat @openzeppelin/contracts
```

### Deploy to Local Network
```bash
npx hardhat run deploy.js --network localhost
```

### Deploy to Testnet (e.g., Sepolia)
```bash
npx hardhat run deploy.js --network sepolia
```

### Deploy to Mainnet
```bash
npx hardhat run deploy.js --network mainnet
```

## Configuration

### Hardhat Config Example
```javascript
module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY]
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
```

## Usage Examples

### Register an App
```javascript
const price = ethers.utils.parseUnits("100", 6); // 100 DEFAI
const maxSupply = 1000;
const metadataUri = "ipfs://QmXxx..."; // IPFS metadata

await appFactory.registerApp(price, maxSupply, metadataUri);
```

### Purchase App Access
```javascript
// First approve DEFAI tokens
await defaiToken.approve(appFactory.address, price);

// Then purchase
await appFactory.purchaseAppAccess(appId);
```

### Submit a Review
```javascript
const rating = 5; // 1-5
const commentCid = "QmYyyy..."; // IPFS CID for comment

await appFactory.submitReview(appId, rating, commentCid);
```

## Security Features

1. **ReentrancyGuard**: Prevents reentrancy attacks on purchase and refund functions
2. **Pausable**: Admin can pause contract in emergencies
3. **Ownable2Step**: Secure 2-step ownership transfer
4. **Input Validation**: All inputs are validated for correctness
5. **Access Control**: Creator-only and owner-only functions are protected
6. **Non-transferable SFTs**: App access tokens cannot be transferred between users

## Gas Optimization Strategies

1. **Packed Structs**: Structs are organized to minimize storage slots
2. **Mapping over Arrays**: Use mappings for O(1) lookups where possible
3. **Batch Operations**: Support batch purchases to save on gas
4. **Storage Patterns**: Minimize SSTORE operations

## Testing

Create test files in `test/` directory:

```javascript
const { expect } = require("chai");

describe("DefaiAppFactory", function () {
  it("Should register an app", async function () {
    // Test implementation
  });
  
  it("Should purchase app access", async function () {
    // Test implementation
  });
});
```

Run tests:
```bash
npx hardhat test
```

## Differences from Solana Implementation

| Feature | Solana | EVM |
|---------|--------|-----|
| Token Standard | SPL Tokens | ERC20 (DEFAI) + ERC1155 (SFTs) |
| Access Control | PDAs | Mappings + Modifiers |
| Storage Cost | Rent-based | Gas-based |
| Upgrade Pattern | Program upgradeable | Proxy patterns (optional) |
| Cross-program Calls | CPIs | External contract calls |
| Authority Transfer | Custom 2-step | Ownable2Step |

## Future Enhancements

1. **Proxy Upgradeability**: Implement UUPS or Transparent proxy for upgrades
2. **Royalties**: Add ERC2981 royalty standard support
3. **Marketplace Features**: Add auction mechanisms, featured apps
4. **DAO Governance**: Implement governance for platform parameters
5. **Cross-chain Bridge**: Enable app access across multiple chains

## License

MIT