# Base Sepolia Deployment Guide

## Quick Start

Your deployment wallet has been created:
- **Address**: `0x279673De24Ac22af26D523E0039Cbf33D5A704B0`
- **Private Key**: Saved in `.env` file

## Step 1: Get Base Sepolia ETH

You need Base Sepolia ETH to deploy contracts. Use one of these faucets:

### Option A: Alchemy Faucet (Recommended)
1. Go to: https://www.alchemy.com/faucets/base-sepolia
2. Enter wallet address: `0x279673De24Ac22af26D523E0039Cbf33D5A704B0`
3. Complete captcha and request ETH
4. You'll receive 0.05 ETH (enough for deployment)

### Option B: QuickNode Faucet
1. Go to: https://faucet.quicknode.com/base/sepolia
2. Connect with social account
3. Enter wallet address: `0x279673De24Ac22af26D523E0039Cbf33D5A704B0`
4. Request ETH

### Option C: Bridge from Sepolia
If you have Sepolia ETH:
1. Go to: https://bridge.base.org/
2. Connect wallet with Sepolia ETH
3. Bridge to Base Sepolia

## Step 2: Deploy Contracts

Once you have Base Sepolia ETH (check balance takes ~30 seconds):

```bash
# Deploy to Base Sepolia
npm run deploy:base-sepolia
```

## Step 3: Verify Deployment

After deployment, you'll receive:
- Contract addresses
- Explorer links
- Deployment confirmation

## Contract Interaction

After deployment, you can interact with contracts:

### Using Hardhat Console
```bash
npx hardhat console --network baseSepolia
```

```javascript
// Get contract instances
const Factory = await ethers.getContractFactory("DefaiAppFactory");
const factory = await Factory.attach("YOUR_FACTORY_ADDRESS");

// Register an app
await factory.registerApp(
  ethers.utils.parseUnits("10", 6), // 10 DEFAI
  100, // max supply
  "ipfs://QmYourMetadata"
);

// Check total apps
const totalApps = await factory.totalApps();
console.log("Total apps:", totalApps.toString());
```

### Using Cast (Foundry)
```bash
# Read contract
cast call YOUR_FACTORY_ADDRESS "totalApps()" --rpc-url https://sepolia.base.org

# Send transaction
cast send YOUR_FACTORY_ADDRESS "registerApp(uint256,uint256,string)" \
  10000000 100 "ipfs://metadata" \
  --private-key $PRIVATE_KEY \
  --rpc-url https://sepolia.base.org
```

## Useful Links

- **Base Sepolia Explorer**: https://sepolia.basescan.org
- **Base Sepolia RPC**: https://sepolia.base.org
- **Chain ID**: 84532
- **Currency**: ETH

## Troubleshooting

### "Insufficient balance" error
- Make sure you have at least 0.01 ETH in your wallet
- Wait 1-2 minutes after receiving from faucet

### "Network error" 
- Check your internet connection
- Try alternative RPC: https://base-sepolia.blockpi.network/v1/rpc/public

### "Gas price too high"
- Base Sepolia usually has low gas prices
- If issues persist, try reducing gas price in hardhat.config.js

## Security Notes

⚠️ **NEVER share your private key!**
- The private key in `.env` controls your deployment wallet
- Keep `.env` file secure and never commit to git
- For production, use hardware wallets or secure key management

## Next Steps

After successful deployment:
1. Save the deployment JSON file
2. Share contract addresses with your team
3. Test all contract functions
4. Create a frontend interface if needed

---

Need help? Check the main README or open an issue.