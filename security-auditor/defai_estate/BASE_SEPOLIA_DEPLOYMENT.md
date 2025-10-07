# Base Sepolia Deployment Guide

## 🚀 DefAI Estate Smart Contracts - Base Sepolia Testnet

### 📍 Deployment Information

**Network:** Base Sepolia  
**Chain ID:** 84532  
**RPC URL:** https://sepolia.base.org  
**Explorer:** https://sepolia.basescan.org

### 💳 Deployment Wallet

```
Address: 0xfed5F8b3FcfB3c8E65E42EDb4abFda1513081E26
```

### 📊 Expected Contract Addresses

Based on the deployment wallet nonce, the contracts will be deployed to:

| Contract | Address | Explorer Link |
|----------|---------|---------------|
| DefAIEstateMinimal | `0x88b681d4cAE9972Ece0a0c972fBC6511f5BBAE8f` | [View](https://sepolia.basescan.org/address/0x88b681d4cAE9972Ece0a0c972fBC6511f5BBAE8f) |
| TokenVault | `0x735490Fcf98a487e394648Db98AbD2235a8257BB` | [View](https://sepolia.basescan.org/address/0x735490Fcf98a487e394648Db98AbD2235a8257BB) |
| EmergencyManager | `0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3` | [View](https://sepolia.basescan.org/address/0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3) |

### 💰 Funding Your Wallet

To deploy the contracts, you need Base Sepolia ETH. Get testnet ETH from:

1. **Alchemy Faucet** (Recommended)
   - URL: https://www.alchemy.com/faucets/base-sepolia
   - Amount: 0.5 ETH
   - Requirements: Free Alchemy account

2. **Coinbase Faucet**
   - URL: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Requirements: Coinbase account

3. **QuickNode Faucet**
   - URL: https://faucet.quicknode.com/base/sepolia
   - Requirements: QuickNode account

4. **Bware Labs Faucet**
   - URL: https://bwarelabs.com/faucets/base-sepolia
   - Requirements: None

### 📈 Deployment Cost Estimates

| Component | Estimated Gas | Estimated Cost (ETH) |
|-----------|---------------|---------------------|
| DefAIEstateMinimal | 5,000,000 | ~0.00053 |
| TokenVault | 3,000,000 | ~0.00032 |
| EmergencyManager | 3,000,000 | ~0.00032 |
| **Total** | **11,000,000** | **~0.00117** |

*Recommended balance: 0.05 ETH (includes buffer for gas price fluctuations)*

### 🛠️ Deployment Commands

1. **Check wallet balance:**
   ```bash
   node scripts/check-balance.js
   ```

2. **Fund wallet (opens faucet and monitors balance):**
   ```bash
   node scripts/fund-wallet.js
   ```

3. **Deploy contracts:**
   ```bash
   npm run deploy:base-sepolia
   ```
   
   Or directly:
   ```bash
   npx hardhat run scripts/deploy-base-sepolia.js --network baseSepolia
   ```

4. **Simulate deployment (preview without spending gas):**
   ```bash
   node scripts/simulate-deployment.js
   ```

### 📝 Post-Deployment Steps

1. **Verify contracts on BaseScan:**
   ```bash
   npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS>
   ```

2. **Test basic functionality:**
   ```bash
   npx hardhat run scripts/test-deployment.js --network baseSepolia
   ```

3. **Check deployment info:**
   ```bash
   cat deployments/base-sepolia-deployment.json
   ```

### 🔧 Configuration Files

- **Network Config:** `hardhat.config.js`
- **Environment Variables:** `.env`
- **Deployment Script:** `scripts/deploy-base-sepolia.js`
- **Deployment Output:** `deployments/base-sepolia-deployment.json`

### 📊 Contract Features

**DefAIEstateMinimal:**
- Estate creation and management
- Beneficiary management with share allocation
- Real World Asset (RWA) tracking
- Inheritance triggering and claiming
- Check-in mechanism for activity tracking

**TokenVault:**
- ERC20 token custody
- ERC721 NFT storage
- Proportional distribution to beneficiaries
- Secure claim mechanism

**EmergencyManager:**
- Emergency lock/unlock controls
- Guardian management system
- Multi-approval mechanisms
- Configurable security parameters

### 🔒 Security Features

- ✅ ReentrancyGuard protection
- ✅ Role-based access control
- ✅ Input validation
- ✅ Timelock mechanisms
- ✅ Multi-signature support
- ✅ Emergency controls

### 🚦 Deployment Status

| Step | Status | Details |
|------|--------|---------|
| 1. Wallet Creation | ✅ Complete | Wallet created and configured |
| 2. Network Configuration | ✅ Complete | Base Sepolia added to Hardhat |
| 3. Deployment Scripts | ✅ Complete | Scripts ready for deployment |
| 4. Wallet Funding | ⏳ Waiting | Need Base Sepolia ETH |
| 5. Contract Deployment | 🔜 Ready | Awaiting funding |
| 6. Verification | 🔜 Pending | After deployment |

### 📚 Resources

- **Base Documentation:** https://docs.base.org
- **Base Sepolia Explorer:** https://sepolia.basescan.org
- **Base Discord:** https://discord.gg/base
- **Hardhat Documentation:** https://hardhat.org/docs

### 🆘 Troubleshooting

**Issue: Insufficient balance**
- Solution: Get more testnet ETH from faucets listed above

**Issue: Transaction fails**
- Solution: Increase gas limit in deployment script
- Check network congestion on https://sepolia.basescan.org/gastracker

**Issue: Contract too large**
- Solution: Already using DefAIEstateMinimal optimized version

**Issue: RPC connection error**
- Solution: Try alternative RPC endpoints or check internet connection

### 📞 Support

For deployment assistance:
1. Check the deployment scripts in `/scripts`
2. Review error logs in console output
3. Verify network configuration in `hardhat.config.js`
4. Ensure wallet is properly funded

---

*Last Updated: October 7, 2024*  
*DefAI Estate v1.0.0 - Base Sepolia Testnet Deployment*