const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log("Checking wallet balance on Base Sepolia...");
  console.log("Wallet Address:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  const balanceInEth = ethers.formatEther(balance);
  
  console.log(`Balance: ${balanceInEth} ETH`);
  
  if (parseFloat(balanceInEth) < 0.01) {
    console.log("\n⚠️  Insufficient balance for deployment!");
    console.log("Minimum recommended: 0.01 ETH");
    console.log("\nGet Base Sepolia ETH from:");
    console.log("1. Alchemy Faucet: https://www.alchemy.com/faucets/base-sepolia");
    console.log("2. QuickNode Faucet: https://faucet.quicknode.com/base/sepolia");
    console.log("3. Coinbase Faucet: https://www.coinbase.com/faucets");
    return false;
  } else {
    console.log("✅ Sufficient balance for deployment!");
    return true;
  }
}

// Check balance every 30 seconds until funded
async function waitForFunding() {
  console.log("Waiting for wallet funding...\n");
  
  while (true) {
    const funded = await main();
    if (funded) {
      console.log("\n🎉 Wallet is funded! Ready to deploy.");
      break;
    }
    console.log("\nChecking again in 30 seconds...\n");
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

// If run directly, wait for funding
if (require.main === module) {
  waitForFunding()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };