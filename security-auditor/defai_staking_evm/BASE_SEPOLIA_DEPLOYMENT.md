# Base Sepolia Deployment Guide

## 🎯 Deployment Status

The DeFAI Staking smart contracts are ready for deployment to Base Sepolia testnet. All contracts have been tested and verified locally.

## 📋 Pre-Deployment Checklist

✅ **Smart Contracts Ready**
- `DeFAIStaking.sol` - Main staking contract
- `MockDEFAIToken.sol` - Test token for deployment
- All 35 tests passing including fuzz tests

✅ **Network Configuration**
- Base Sepolia network configured in `hardhat.config.js`
- Chain ID: 84532
- RPC URL: https://sepolia.base.org

✅ **Deployment Wallet Created**
```
Address: 0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C
Status: Awaiting funding
Required: 0.01 ETH minimum
```

## 🚀 Deployment Instructions

### Step 1: Fund the Deployment Wallet

The deployment wallet needs Base Sepolia ETH to deploy the contracts.

**Wallet Address:** `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`

#### Get Base Sepolia ETH from Faucets:

1. **Alchemy Faucet** (Recommended)
   - Visit: https://www.alchemy.com/faucets/base-sepolia
   - Enter wallet address
   - Complete captcha
   - Receive 0.1 ETH

2. **QuickNode Faucet**
   - Visit: https://faucet.quicknode.com/base/sepolia
   - Connect wallet or enter address
   - Request testnet ETH

3. **Coinbase Faucet**
   - Visit: https://www.coinbase.com/faucets
   - Sign in with Coinbase account
   - Request Base Sepolia ETH

### Step 2: Check Wallet Balance

```bash
# Check if wallet is funded
node scripts/check-balance.js
```

### Step 3: Deploy Contracts

Once the wallet has at least 0.01 ETH, run:

```bash
# Deploy to Base Sepolia
npx hardhat run scripts/deploy-base-sepolia.js --network baseSepolia
```

This will:
1. Deploy the Mock DEFAI Token
2. Deploy the DeFAI Staking Contract
3. Fund the escrow with 100M DEFAI
4. Save deployment addresses

### Step 4: Verify Contracts (Optional)

After deployment, verify contracts on BaseScan:

```bash
# Verify token contract
npx hardhat verify --network baseSepolia <TOKEN_ADDRESS>

# Verify staking contract
npx hardhat verify --network baseSepolia <STAKING_ADDRESS> <TOKEN_ADDRESS>
```

## 📊 Deployment Estimates

Based on simulation:
- **Token Deployment:** ~1,500,000 gas
- **Staking Deployment:** ~3,000,000 gas
- **Total Cost:** ~0.005-0.01 ETH at 2 gwei

## 🧪 Post-Deployment Testing

### Test Token Faucet
```javascript
// Get test tokens
const token = await ethers.getContractAt("MockDEFAIToken", TOKEN_ADDRESS);
await token.faucet(); // Receives 1M DEFAI
```

### Test Staking
```javascript
// Stake tokens
const staking = await ethers.getContractAt("DeFAIStaking", STAKING_ADDRESS);
await token.approve(STAKING_ADDRESS, amount);
await staking.stakeTokens(amount);
```

### Check Tier Status
```javascript
// Check user stake info
const info = await staking.getUserStakeInfo(userAddress);
console.log("Tier:", ["None", "Gold", "Titanium", "Infinite"][info.tier]);
```

## 🔗 Contract Features on Base Sepolia

### Staking Tiers
- **Gold:** 10M - 99.99M DEFAI (0.5% APY)
- **Titanium:** 100M - 999.99M DEFAI (0.75% APY)
- **Infinite:** 1B+ DEFAI (1% APY)

### Security Features
- 7-day initial lock period
- Unstaking penalties (2% < 30 days, 1% 30-90 days)
- 48-hour timelock for admin functions
- Pausable mechanism
- Reentrancy protection

## 📝 Environment Variables

The `.env` file contains:
```env
PRIVATE_KEY=<deployment_wallet_private_key>
WALLET_ADDRESS=0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

## 🛠️ Utility Scripts

- `scripts/create-wallet.js` - Creates a new deployment wallet
- `scripts/check-balance.js` - Checks wallet balance
- `scripts/deploy-base-sepolia.js` - Deploys to Base Sepolia
- `scripts/simulate-deployment.js` - Simulates deployment locally
- `scripts/interact-base-sepolia.js` - Interact with deployed contracts

## 📍 Important Links

- **Base Sepolia Explorer:** https://sepolia.basescan.org
- **Base Sepolia Faucets:**
  - Alchemy: https://www.alchemy.com/faucets/base-sepolia
  - QuickNode: https://faucet.quicknode.com/base/sepolia
- **Base Bridge:** https://bridge.base.org/

## ⚠️ Security Notes

1. **Private Key Security:** The private key is stored in `.env` file. Never commit this file to git.
2. **Testnet Only:** This deployment is for Base Sepolia testnet only.
3. **Admin Controls:** The deployer address becomes the contract owner with admin privileges.

## 🎯 Current Status

### ✅ Completed
- Smart contracts developed and tested
- Network configuration set up
- Deployment scripts created
- Wallet generated

### ⏳ Pending
- Wallet funding (requires 0.01 ETH on Base Sepolia)
- Actual deployment execution
- Contract verification on BaseScan

## 💡 Quick Deploy Command

Once wallet is funded:
```bash
# One-line deployment
npx hardhat run scripts/deploy-base-sepolia.js --network baseSepolia
```

---

**Note:** The contracts are fully tested and ready for deployment. The only requirement is funding the deployment wallet with Base Sepolia ETH to cover gas fees.