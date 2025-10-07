#!/usr/bin/env node

const { ethers } = require("ethers");
const { spawn } = require("child_process");
require("dotenv").config();

async function checkBalance() {
    const provider = new ethers.providers.JsonRpcProvider("https://sepolia.base.org");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const balance = await wallet.getBalance();
    return { balance, address: wallet.address };
}

async function main() {
    console.log("\n========================================");
    console.log("Base Sepolia Auto-Deploy Monitor");
    console.log("========================================\n");

    const { address } = await checkBalance();
    
    console.log("📍 Monitoring wallet:", address);
    console.log("⏳ Waiting for Base Sepolia ETH...\n");
    console.log("Get ETH from one of these faucets:");
    console.log("1. https://www.alchemy.com/faucets/base-sepolia");
    console.log("2. https://faucet.quicknode.com/base/sepolia");
    console.log("3. https://bridge.base.org/ (bridge from Sepolia)\n");
    console.log("Send ETH to:", address);
    console.log("\n[Press Ctrl+C to stop monitoring]\n");

    let deployed = false;
    let checkCount = 0;

    while (!deployed) {
        try {
            const { balance, address } = await checkBalance();
            const ethBalance = ethers.utils.formatEther(balance);
            
            // Show progress indicator
            const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            process.stdout.write(`\r${spinner[checkCount % spinner.length]} Checking balance... ${ethBalance} ETH`);
            
            if (balance.gt(ethers.utils.parseEther("0.001"))) {
                console.log("\n\n✅ ETH received! Balance:", ethBalance, "ETH");
                console.log("🚀 Starting deployment...\n");
                
                // Run deployment script
                const deploy = spawn("npx", [
                    "hardhat",
                    "run",
                    "scripts/deploy-base-sepolia.js",
                    "--network",
                    "baseSepolia"
                ], { stdio: "inherit" });

                deploy.on("close", (code) => {
                    if (code === 0) {
                        console.log("\n✅ Deployment completed successfully!");
                        deployed = true;
                    } else {
                        console.log("\n❌ Deployment failed with code:", code);
                        process.exit(1);
                    }
                });

                // Wait for deployment to finish
                await new Promise(resolve => deploy.on("close", resolve));
                
            } else {
                // Wait 5 seconds before checking again
                await new Promise(resolve => setTimeout(resolve, 5000));
                checkCount++;
            }
        } catch (error) {
            console.error("\n❌ Error checking balance:", error.message);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});