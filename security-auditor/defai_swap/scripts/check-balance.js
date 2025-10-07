const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking wallet balance on Base Sepolia...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📝 Wallet Address:", deployer.address);

  try {
    const balance = await ethers.provider.getBalance(deployer.address);
    const balanceInEth = ethers.formatEther(balance);
    
    console.log("💰 Balance:", balanceInEth, "ETH");
    
    // Check if balance is sufficient for deployment
    const minRequired = 0.01; // Minimum ETH needed for deployment
    if (parseFloat(balanceInEth) < minRequired) {
      console.log("\n⚠️  Insufficient balance for deployment!");
      console.log(`📊 Required: At least ${minRequired} ETH`);
      console.log("\n💡 Get Base Sepolia ETH from:");
      console.log("   1. Coinbase Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
      console.log("   2. Your wallet address:", deployer.address);
      console.log("\n   Note: You'll need to verify with Coinbase account to use the faucet");
    } else {
      console.log("\n✅ Balance sufficient for deployment!");
      console.log("   Run 'npm run deploy:base-sepolia' to deploy contracts");
    }

    // Check network
    const network = await ethers.provider.getNetwork();
    console.log("\n🌐 Network Info:");
    console.log("   Chain ID:", network.chainId.toString());
    console.log("   Name:", network.name || "Base Sepolia");

  } catch (error) {
    console.error("❌ Error checking balance:", error.message);
    if (error.message.includes("network")) {
      console.log("\n💡 Make sure you're connected to Base Sepolia");
      console.log("   RPC URL: https://sepolia.base.org");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });