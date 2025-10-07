const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function createWallet() {
    console.log("🔑 Creating new Ethereum wallet for Base Sepolia deployment...\n");
    
    // Create a new random wallet
    const wallet = ethers.Wallet.createRandom();
    
    console.log("Wallet created successfully!");
    console.log("================================");
    console.log("Address:", wallet.address);
    console.log("================================");
    
    // Create .env file if it doesn't exist
    const envPath = path.join(__dirname, "../.env");
    const envContent = `# Base Sepolia Configuration
PRIVATE_KEY=${wallet.privateKey}
WALLET_ADDRESS=${wallet.address}

# Base Sepolia RPC URL
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Base Sepolia Explorer
BASE_SEPOLIA_EXPLORER=https://sepolia.basescan.org

# Optional: Alchemy or Infura endpoints for Base Sepolia
# ALCHEMY_BASE_SEPOLIA_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
# INFURA_BASE_SEPOLIA_URL=https://base-sepolia.infura.io/v3/YOUR_API_KEY

# Block Explorer API (for contract verification)
BASESCAN_API_KEY=YOUR_BASESCAN_API_KEY
`;
    
    fs.writeFileSync(envPath, envContent);
    console.log("\n✅ Configuration saved to .env file");
    
    console.log("\n⚠️  IMPORTANT: ");
    console.log("1. Save your private key securely!");
    console.log("2. Fund your wallet with Base Sepolia ETH");
    console.log("3. Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
    console.log("   or https://faucet.quicknode.com/base/sepolia");
    
    console.log("\n📝 Next steps:");
    console.log("1. Copy the address above");
    console.log("2. Get Base Sepolia ETH from the faucet");
    console.log("3. Run: npm run deploy:base-sepolia");
    
    return wallet;
}

createWallet()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });