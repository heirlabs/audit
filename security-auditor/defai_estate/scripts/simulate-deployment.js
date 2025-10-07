const { ethers } = require("ethers");
require("dotenv").config();

async function simulateDeployment() {
    console.log("🔮 Simulating DefAI Estate deployment to Base Sepolia...\n");
    
    const provider = new ethers.providers.JsonRpcProvider(
        process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"
    );
    
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log("Deployment wallet:", wallet.address);
    
    // Check current balance
    const balance = await provider.getBalance(wallet.address);
    const balanceInEth = ethers.utils.formatEther(balance);
    console.log("Current balance:", balanceInEth, "ETH");
    
    if (parseFloat(balanceInEth) < 0.01) {
        console.log("\n⏳ Waiting for wallet to be funded...");
        console.log("Please visit: https://www.alchemy.com/faucets/base-sepolia");
        console.log("And fund address:", wallet.address);
        
        // Estimate deployment costs
        console.log("\n📊 Estimated Deployment Costs:");
        console.log("================================");
        
        const gasPrice = await provider.getGasPrice();
        const gasPriceGwei = ethers.utils.formatUnits(gasPrice, "gwei");
        console.log("Current gas price:", gasPriceGwei, "gwei");
        
        const estimates = {
            DefAIEstateMinimal: 5000000,
            TokenVault: 3000000,
            EmergencyManager: 3000000
        };
        
        let totalGas = 0;
        for (const [contract, gasLimit] of Object.entries(estimates)) {
            const cost = gasPrice.mul(gasLimit);
            const costInEth = ethers.utils.formatEther(cost);
            console.log(`${contract}: ~${costInEth} ETH`);
            totalGas += parseInt(gasLimit);
        }
        
        const totalCost = gasPrice.mul(totalGas);
        const totalCostInEth = ethers.utils.formatEther(totalCost);
        console.log("--------------------------------");
        console.log("Total estimated cost:", totalCostInEth, "ETH");
        console.log("Recommended balance: 0.05 ETH");
        
        // Generate deployment preview
        console.log("\n🎯 Deployment Preview:");
        console.log("================================");
        
        // Compute contract addresses (deterministic)
        const nonce = await provider.getTransactionCount(wallet.address);
        
        const contractAddresses = {
            DefAIEstateMinimal: ethers.utils.getContractAddress({
                from: wallet.address,
                nonce: nonce
            }),
            TokenVault: ethers.utils.getContractAddress({
                from: wallet.address,
                nonce: nonce + 1
            }),
            EmergencyManager: ethers.utils.getContractAddress({
                from: wallet.address,
                nonce: nonce + 2
            })
        };
        
        console.log("Expected contract addresses:");
        for (const [name, address] of Object.entries(contractAddresses)) {
            console.log(`${name}: ${address}`);
        }
        
        console.log("\n🔗 Future Explorer Links:");
        for (const [name, address] of Object.entries(contractAddresses)) {
            console.log(`${name}: https://sepolia.basescan.org/address/${address}`);
        }
        
        // Create deployment command
        console.log("\n📝 Ready-to-use Deployment Commands:");
        console.log("================================");
        console.log("1. Check balance:");
        console.log("   node scripts/check-balance.js");
        console.log("\n2. Deploy contracts:");
        console.log("   npm run deploy:base-sepolia");
        console.log("\n3. Or use direct script:");
        console.log("   npx hardhat run scripts/deploy-base-sepolia.js --network baseSepolia");
        
        return false;
    } else {
        console.log("\n✅ Wallet is funded! Ready for deployment.");
        console.log("\nRun: npm run deploy:base-sepolia");
        return true;
    }
}

simulateDeployment()
    .then((ready) => {
        if (ready) {
            console.log("\n🚀 Ready to deploy!");
        } else {
            console.log("\n⏳ Waiting for funding...");
        }
        process.exit(0);
    })
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });