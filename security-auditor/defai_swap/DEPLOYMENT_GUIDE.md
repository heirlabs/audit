# DefAI Swap - Base Sepolia Deployment Guide

## 🚀 Deployment Status

### Wallet Information
- **Address**: `0xB299c10EFB32472EaB14bf0fa949c50564Acf485`
- **Network**: Base Sepolia (Chain ID: 84532)
- **Status**: ⚠️ Awaiting funding (0.01 ETH required)

### Expected Contract Addresses (Deterministic)
Once deployed, the contracts will be at these addresses:
- **OLD DEFAI Token**: `0x63863EC3AD63DdFB0bd678c18B3e716C6667e542`
- **DEFAI Token**: `0x37F361620108eB867f2A7C4D59aFe32f2aADDc24`
- **NFT Contract**: `0x30C6bb024c05F4a950A2Bfbf80b1b284681235b5`
- **Swap Contract**: `0x542DDe3C4956718B961CFDdA2a4C2A72c6d61811`

## 📋 Quick Start Commands

```bash
# Check wallet balance
npm run check-balance

# Deploy to Base Sepolia (once funded)
npm run deploy:base-sepolia

# Run tests
npm run test
```

## 💰 Funding Instructions

### Step 1: Get Base Sepolia ETH
1. Visit [Coinbase Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
2. Sign in with your Coinbase account
3. Enter wallet address: `0xB299c10EFB32472EaB14bf0fa949c50564Acf485`
4. Request 0.1 ETH (more than enough for deployment)

### Alternative: Bridge from Sepolia
1. Get Sepolia ETH from [Sepolia Faucet](https://sepoliafaucet.com/)
2. Bridge to Base Sepolia at [Base Bridge](https://bridge.base.org/)

## 🛠️ Deployment Process

Once the wallet is funded with at least 0.01 ETH:

### 1. Deploy Contracts
```bash
npm run deploy:base-sepolia
```

This will deploy:
1. Mock OLD DEFAI Token (ERC20)
2. Mock DEFAI Token (ERC20)
3. DefAI NFT Collection (ERC721)
4. DefAI Swap Contract (Main Protocol)

### 2. Post-Deployment Setup

#### Chainlink VRF Configuration
1. Visit [Chainlink VRF](https://vrf.chain.link/)
2. Create a new subscription on Base Sepolia
3. Fund with LINK tokens
4. Add the Swap Contract address as a consumer
5. Update the subscription ID in the contract if needed

## 📊 Contract Configuration

### Tax System
- Initial: 5% (500 basis points)
- Increment: +1% per swap
- Maximum: 30%
- Reset: After 24 hours of no activity

### NFT Tiers & Pricing
| Tier | Name   | Price (DEFAI) | Supply | Bonus Range |
|------|--------|---------------|--------|-------------|
| 0    | OG     | 100          | 100*   | 0%          |
| 1    | Train  | 200          | 200    | 0-15%       |
| 2    | Boat   | 500          | 300    | 15-50%      |
| 3    | Plane  | 1000         | 400    | 20-100%     |
| 4    | Rocket | 2000         | 500    | 50-300%     |

*50 reserved for OG holders

### Vesting Parameters
- Duration: 90 days
- Cliff Period: 2 days
- Type: Linear after cliff

## 🔍 Verification & Testing

### Base Sepolia Block Explorer
- [Base Sepolia Explorer](https://sepolia.basescan.org)
- View transactions: `https://sepolia.basescan.org/address/{CONTRACT_ADDRESS}`

### Testing Checklist
- [ ] All contracts deployed successfully
- [ ] NFT minting role granted to Swap contract
- [ ] Collection initialized with correct parameters
- [ ] Test tokens distributed to deployer
- [ ] VRF subscription created and funded
- [ ] Swap contract added as VRF consumer

## 📝 Important Files

- `.env` - Contains private keys and RPC URLs (DO NOT COMMIT)
- `wallet-info.json` - Wallet backup information (KEEP SECURE)
- `deployment-base-sepolia.json` - Deployment addresses (created after deploy)
- `deployment-dry-run.json` - Dry run simulation results

## 🔐 Security Notes

1. **Private Key Security**: Never share or commit your private key
2. **Wallet Backup**: Save the mnemonic phrase securely
3. **Test First**: Always test on testnet before mainnet
4. **VRF Security**: Ensure proper VRF subscription management

## 📞 Support & Resources

- [Base Documentation](https://docs.base.org/)
- [Base Discord](https://discord.gg/buildonbase)
- [Chainlink VRF Docs](https://docs.chain.link/vrf/v2/introduction)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)

## 🎯 Next Steps After Deployment

1. **Test Basic Functionality**
   - Initialize user tax states
   - Test token swaps
   - Verify NFT minting

2. **Configure Merkle Trees**
   - Set up proper OG holder merkle root
   - Configure airdrop merkle root

3. **Production Preparation**
   - Audit the contracts
   - Set up monitoring
   - Prepare for mainnet deployment

## 📈 Gas Costs Estimate

- MockERC20 deployment: ~0.001 ETH each (x2)
- NFT contract deployment: ~0.002 ETH
- Swap contract deployment: ~0.004 ETH
- Initialization transactions: ~0.001 ETH
- **Total: ~0.01 ETH**

---

**Current Status**: ⏳ Awaiting wallet funding to proceed with deployment

**Wallet Address**: `0xB299c10EFB32472EaB14bf0fa949c50564Acf485`

**Required**: 0.01 ETH minimum on Base Sepolia network