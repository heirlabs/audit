const { ethers } = require("ethers");
require("dotenv").config();

async function fundWallet() {
    console.log("💰 Base Sepolia Testnet Funding Guide\n");
    console.log("========================================");
    
    const address = process.env.WALLET_ADDRESS;
    console.log("Your wallet address:", address);
    console.log("========================================\n");
    
    console.log("📋 Copy the address above and visit one of these faucets:\n");
    
    console.log("Option 1: Alchemy Faucet (Recommended)");
    console.log("🔗 https://www.alchemy.com/faucets/base-sepolia");
    console.log("   - Requires free Alchemy account");
    console.log("   - Provides 0.5 Base Sepolia ETH\n");
    
    console.log("Option 2: Coinbase Faucet");
    console.log("🔗 https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
    console.log("   - Requires Coinbase account");
    console.log("   - Daily limit applies\n");
    
    console.log("Option 3: QuickNode Faucet");
    console.log("🔗 https://faucet.quicknode.com/base/sepolia");
    console.log("   - Requires QuickNode account");
    console.log("   - Provides testnet ETH\n");
    
    console.log("Option 4: Bware Labs Faucet");
    console.log("🔗 https://bwarelabs.com/faucets/base-sepolia");
    console.log("   - No account required");
    console.log("   - Limited daily claims\n");
    
    console.log("📝 Steps to get testnet ETH:");
    console.log("1. Visit one of the faucets above");
    console.log("2. Paste your wallet address:", address);
    console.log("3. Complete any required verification");
    console.log("4. Wait for the transaction to confirm (usually 1-2 minutes)");
    console.log("5. Run 'node scripts/check-balance.js' to verify funding\n");
    
    // Try to open the Alchemy faucet in the browser
    const openUrl = async (url) => {
        const { exec } = require('child_process');
        const command = process.platform === 'darwin' ? 'open' : 
                        process.platform === 'win32' ? 'start' : 'xdg-open';
        
        exec(`${command} ${url}`, (error) => {
            if (!error) {
                console.log("✅ Opened Alchemy faucet in your browser!");
            }
        });
    };
    
    console.log("🌐 Attempting to open Alchemy faucet in your browser...");
    openUrl("https://www.alchemy.com/faucets/base-sepolia");
    
    // Monitor balance
    console.log("\n⏳ Monitoring wallet balance (press Ctrl+C to stop)...\n");
    
    const provider = new ethers.providers.JsonRpcProvider(
        process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"
    );
    
    let previousBalance = "0";
    
    const checkBalance = async () => {
        try {
            const balance = await provider.getBalance(address);
            const balanceInEth = ethers.utils.formatEther(balance);
            
            if (balanceInEth !== previousBalance) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] Balance: ${balanceInEth} ETH`);
                
                if (parseFloat(balanceInEth) > 0) {
                    console.log("\n🎉 Wallet funded successfully!");
                    console.log("✅ You can now deploy contracts with: npm run deploy:base-sepolia");
                    process.exit(0);
                }
                
                previousBalance = balanceInEth;
            }
        } catch (error) {
            // Silent fail, continue monitoring
        }
    };
    
    // Check balance every 5 seconds
    setInterval(checkBalance, 5000);
    checkBalance(); // Initial check
}

fundWallet().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});