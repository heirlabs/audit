# Developer Documentation - DeFAI Contracts

## 📍 Deployed Contract Addresses (Base Sepolia)

### Core Contracts

| Contract | Address | Status | Explorer |
|----------|---------|--------|----------|
| **MockHeirToken** | `0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42` | ✅ Active | [View](https://sepolia.basescan.org/address/0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42) |
| **DefaiAppFactory** | `0x900A0a4F6465189D57B1DCd7Edd6049480DbCC33` | ✅ Active | [View](https://sepolia.basescan.org/address/0x900A0a4F6465189D57B1DCd7Edd6049480DbCC33) |
| **DeFAIStakingUpgradeable (Impl)** | `0xc30FcC9ad0F0233843F2171F587AE44086e92ffa` | ⚠️ Needs Proxy | [View](https://sepolia.basescan.org/address/0xc30FcC9ad0F0233843F2171F587AE44086e92ffa) |

## 🔧 Development Setup

### Prerequisites
```bash
# Node.js 16+ required
node --version

# Install dependencies
npm install
```

### Environment Variables
Create a `.env` file:
```env
# Deployment wallet (DO NOT COMMIT)
PRIVATE_KEY=your_private_key_here
WALLET_ADDRESS=0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C

# RPC URLs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Contract Addresses
HEIR_TOKEN_ADDRESS=0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42
APP_FACTORY_ADDRESS=0x900A0a4F6465189D57B1DCd7Edd6049480DbCC33
STAKING_IMPL_ADDRESS=0xc30FcC9ad0F0233843F2171F587AE44086e92ffa
```

## 💰 MockHeirToken

### Contract Details
- **Name:** Mock Heir Token
- **Symbol:** HEIR
- **Decimals:** 6
- **Total Supply:** 100,000,000,000 (100 Billion)

### Token Distribution
| Address | Amount | Percentage |
|---------|--------|------------|
| `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C` | 50,000,000,000 HEIR | 50% |
| `0x48b2680068f311e7d777dc9502957325dae1df99` | 50,000,000,000 HEIR | 50% |

### Key Functions
```solidity
// Mint tokens (owner only)
function mint(address to, uint256 amount) public onlyOwner

// Burn tokens
function burn(uint256 amount) public

// Faucet (24hr cooldown)
function faucet() public
```

## 🏭 DefaiAppFactory

### Features
- Create decentralized apps with staking requirements
- Updateable staking token address
- Platform fee collection (20%)
- App management (activate/deactivate)

### Key Functions
```solidity
// Admin functions
function updateStakingToken(address _newToken) external onlyOwner
function updatePlatformFee(uint256 _newFeeBps) external onlyOwner
function updateTreasury(address _newTreasury) external onlyOwner

// User functions
function createApp(string memory _name, string memory _description, uint256 _stakingRequirement) external
function stakeOnApp(uint256 _appId, uint256 _amount) external
function unstakeFromApp(uint256 _appId, uint256 _amount) external
```

### Configuration
- **Current Staking Token:** HEIR (`0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42`)
- **Platform Fee:** 2000 basis points (20%)
- **Treasury:** `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`

## 📊 DeFAIStakingUpgradeable

### ⚠️ Important Note
This contract is deployed as an implementation and **requires a proxy** to be functional. 

### Deployment Options

#### Option 1: Deploy with Proxy (Recommended)
```javascript
const { ethers, upgrades } = require("hardhat");

async function deployWithProxy() {
    const DeFAIStaking = await ethers.getContractFactory("DeFAIStakingUpgradeable");
    const proxy = await upgrades.deployProxy(DeFAIStaking, [
        HEIR_TOKEN_ADDRESS,  // _defaiToken
        HEIR_TOKEN_ADDRESS,  // _oldDefaiToken (same for now)
        ADMIN_ADDRESS        // _admin
    ]);
    await proxy.deployed();
    console.log("Proxy deployed to:", proxy.address);
}
```

#### Option 2: Connect to Existing Implementation
```javascript
// NOT RECOMMENDED - Implementation cannot be initialized directly
const impl = await ethers.getContractAt(
    "DeFAIStakingUpgradeable", 
    "0xc30FcC9ad0F0233843F2171F587AE44086e92ffa"
);
```

### Staking Tiers

| Tier | Min Stake | Max Stake | APY | Lock Period |
|------|-----------|-----------|-----|-------------|
| **Gold** | 10M HEIR | 99.99M HEIR | 0.5% | 7 days |
| **Titanium** | 100M HEIR | 999.99M HEIR | 0.75% | 7 days |
| **Infinite** | 1B HEIR | Unlimited | 1% | 7 days |

### Key Functions
```solidity
// Staking functions
function stake(uint256 amount, uint256 lockPeriod) external
function unstake(uint256 amount) external
function claimRewards() external

// Admin functions
function pause() external onlyRole(PAUSER_ROLE)
function unpause() external onlyRole(PAUSER_ROLE)
function updateTokens(address _new, address _old) external onlyRole(ADMIN_ROLE)
function blacklistUser(address user) external onlyRole(BLACKLIST_ROLE)
```

### Access Control Roles
- `DEFAULT_ADMIN_ROLE`: Full admin access
- `ADMIN_ROLE`: Token and configuration management
- `PAUSER_ROLE`: Emergency pause/unpause
- `UPGRADER_ROLE`: Contract upgrades
- `BLACKLIST_ROLE`: User blacklist management

## 🚀 Deployment Scripts

### Deploy All Contracts
```bash
# Navigate to defai_app_factory
cd security-auditor/defai_app_factory
npm run deploy-all

# For staking upgradeable
cd ../defai_staking_evm
npm run deploy
```

### Verify Balances
```bash
npm run check-balances
```

## 🧪 Testing

### Run Tests
```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Run with coverage
npx hardhat coverage
```

### Test Networks
- **Base Sepolia**: Chain ID 84532
- **RPC URL**: https://sepolia.base.org

## 🔐 Security Considerations

1. **Private Keys**: Never commit private keys or `.env` files
2. **Admin Access**: Use multisig for production deployments
3. **Upgradeable Contracts**: Test upgrades thoroughly on testnet
4. **Token Transfers**: Verify recipient addresses before large transfers
5. **Staking Locks**: Users cannot unstake during lock period

## 📝 Common Operations

### Update Staking Token in DefaiAppFactory
```javascript
const factory = await ethers.getContractAt("DefaiAppFactory", FACTORY_ADDRESS);
await factory.updateStakingToken(NEW_TOKEN_ADDRESS);
```

### Create App and Stake
```javascript
// Create app
const tx1 = await factory.createApp(
    "My DeFAI App",
    "Description here",
    ethers.utils.parseUnits("1000", 6) // 1000 HEIR minimum
);

// Stake on app (approve tokens first)
const token = await ethers.getContractAt("MockHeirToken", HEIR_ADDRESS);
await token.approve(factory.address, amount);
await factory.stakeOnApp(appId, amount);
```

### Deploy Proxy for DeFAIStakingUpgradeable
```javascript
const { ethers, upgrades } = require("hardhat");

const implementation = "0xc30FcC9ad0F0233843F2171F587AE44086e92ffa";
const DeFAIStaking = await ethers.getContractFactory("DeFAIStakingUpgradeable");

// Deploy proxy pointing to implementation
const proxy = await upgrades.deployProxy(DeFAIStaking, [
    HEIR_TOKEN,
    OLD_TOKEN,
    ADMIN
], { 
    unsafeAllow: ['external-library-linking'],
    initializer: 'initialize'
});
```

## 📞 Support & Resources

- **Repository**: [github.com/heirlabs/audit](https://github.com/heirlabs/audit)
- **Block Explorer**: [Base Sepolia Scan](https://sepolia.basescan.org)
- **Faucet**: [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-11 | Initial deployment of MockHeirToken and DefaiAppFactory |
| 1.1.0 | 2025-11-11 | Added DeFAIStakingUpgradeable implementation |

---

**Last Updated:** November 11, 2025
**Network:** Base Sepolia
**Maintainer:** DeFAI Team