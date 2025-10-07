const { ethers } = require("ethers");
require("dotenv").config();

async function checkBalance() {
    const provider = new ethers.providers.JsonRpcProvider(
        process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"
    );
    
    const address = process.env.WALLET_ADDRESS;
    
    console.log("🔍 Checking Base Sepolia balance...");
    console.log("Wallet:", address);
    
    try {
        const balance = await provider.getBalance(address);
        const balanceInEth = ethers.utils.formatEther(balance);
        
        console.log("Balance:", balanceInEth, "ETH");
        
        if (parseFloat(balanceInEth) < 0.01) {
            console.log("\n⚠️  Insufficient balance for deployment!");
            console.log("Please fund your wallet with Base Sepolia ETH from:");
            console.log("https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
            console.log("or https://faucet.quicknode.com/base/sepolia");
        } else {
            console.log("\n✅ Sufficient balance for deployment!");
        }
        
        return balanceInEth;
    } catch (error) {
        console.error("Error checking balance:", error.message);
        return "0";
    }
}

checkBalance()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });