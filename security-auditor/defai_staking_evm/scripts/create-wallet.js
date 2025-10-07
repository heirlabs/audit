const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Creating new deployment wallet...\n");

  // Create a new random wallet
  const wallet = ethers.Wallet.createRandom();
  
  console.log("=".repeat(60));
  console.log("NEW WALLET CREATED");
  console.log("=".repeat(60));
  console.log("Address:", wallet.address);
  console.log("Private Key:", wallet.privateKey);
  console.log("Mnemonic:", wallet.mnemonic.phrase);
  console.log("=".repeat(60));
  
  // Create .env file if it doesn't exist
  const envPath = path.join(__dirname, "../.env");
  const envContent = `# Deployment Wallet
PRIVATE_KEY=${wallet.privateKey}
WALLET_ADDRESS=${wallet.address}

# RPC URLs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Block Explorer API Keys (optional for verification)
BASESCAN_API_KEY=

# DEFAI Token Address (will be set after deployment)
DEFAI_TOKEN_ADDRESS=
`;

  fs.writeFileSync(envPath, envContent);
  console.log("\n✅ Wallet credentials saved to .env file");
  
  console.log("\n📋 Next Steps:");
  console.log("1. Fund this wallet with Base Sepolia ETH:");
  console.log(`   Address: ${wallet.address}`);
  console.log("\n2. Get Base Sepolia ETH from faucets:");
  console.log("   - https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
  console.log("   - https://faucet.quicknode.com/base/sepolia");
  console.log("   - https://www.alchemy.com/faucets/base-sepolia");
  console.log("\n3. Bridge Sepolia ETH to Base Sepolia:");
  console.log("   - https://bridge.base.org/");
  
  // Check balance
  console.log("\nChecking wallet balance on Base Sepolia...");
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const balance = await provider.getBalance(wallet.address);
  console.log(`Current balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    console.log("\n⚠️  Wallet needs funding before deployment!");
  }
  
  return wallet.address;
}

main()
  .then((address) => {
    console.log("\n✅ Wallet setup complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });