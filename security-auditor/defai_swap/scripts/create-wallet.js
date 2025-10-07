const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function createWallet() {
  console.log("🔑 Creating new deployment wallet...\n");

  // Create a new random wallet
  const wallet = ethers.Wallet.createRandom();

  console.log("📋 Wallet Details:");
  console.log("==================");
  console.log("Address:", wallet.address);
  console.log("Private Key:", wallet.privateKey);
  console.log("Mnemonic:", wallet.mnemonic.phrase);
  console.log("\n⚠️  IMPORTANT: Save these credentials securely!");
  console.log("Never share your private key or mnemonic phrase!\n");

  // Create .env file
  const envContent = `# Base Sepolia Configuration
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=${wallet.privateKey}
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Chainlink VRF Configuration for Base Sepolia
VRF_COORDINATOR=0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634
VRF_KEY_HASH=0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c
VRF_SUBSCRIPTION_ID=1

# Wallet Address (for reference)
WALLET_ADDRESS=${wallet.address}
`;

  const envPath = path.join(__dirname, "..", ".env");
  fs.writeFileSync(envPath, envContent);
  console.log("✅ Created .env file with wallet configuration");

  // Save wallet info to a secure file
  const walletInfo = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase,
    createdAt: new Date().toISOString(),
    network: "Base Sepolia",
    chainId: 84532
  };

  const walletPath = path.join(__dirname, "..", "wallet-info.json");
  fs.writeFileSync(walletPath, JSON.stringify(walletInfo, null, 2));
  console.log("📄 Wallet info saved to wallet-info.json");

  console.log("\n💡 Next Steps:");
  console.log("1. Fund this wallet with Base Sepolia ETH");
  console.log("   - Get Base Sepolia ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
  console.log("   - Or bridge from Sepolia: https://bridge.base.org/");
  console.log("2. Run deployment: npm run deploy:base-sepolia");

  console.log("\n🔗 Useful Links:");
  console.log("- Base Sepolia Explorer: https://sepolia.basescan.org");
  console.log("- Base Sepolia Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
  console.log("- Your wallet on explorer: https://sepolia.basescan.org/address/" + wallet.address);

  return wallet.address;
}

createWallet()
  .then((address) => {
    console.log("\n✅ Wallet created successfully!");
    console.log("📍 Address:", address);
  })
  .catch((error) => {
    console.error("❌ Failed to create wallet:", error);
    process.exit(1);
  });