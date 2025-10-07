#!/usr/bin/env node

const { ethers } = require("ethers");
const fs = require("fs");
const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log("\n========================================");
    console.log("Base Sepolia Deployment Wallet Setup");
    console.log("========================================\n");

    console.log("This script will help you set up a wallet for deployment.\n");
    console.log("Options:");
    console.log("1. Generate a new wallet (for testing)");
    console.log("2. Use an existing private key");
    console.log("3. Exit\n");

    const choice = await question("Enter your choice (1-3): ");

    let privateKey;
    let wallet;

    switch(choice) {
        case "1":
            // Generate new wallet
            console.log("\n🔐 Generating new wallet...");
            wallet = ethers.Wallet.createRandom();
            privateKey = wallet.privateKey.substring(2); // Remove 0x prefix
            
            console.log("\n✅ New wallet generated!");
            console.log("Address:", wallet.address);
            console.log("Private Key:", wallet.privateKey);
            console.log("\n⚠️  IMPORTANT: Save this private key securely!");
            console.log("You will need Base Sepolia ETH to deploy contracts.");
            console.log("\nGet Base Sepolia ETH from:");
            console.log("1. https://www.alchemy.com/faucets/base-sepolia");
            console.log("2. https://faucet.quicknode.com/base/sepolia");
            console.log("3. https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
            break;

        case "2":
            // Use existing private key
            const inputKey = await question("\nEnter your private key (with or without 0x prefix): ");
            privateKey = inputKey.startsWith("0x") ? inputKey.substring(2) : inputKey;
            
            try {
                wallet = new ethers.Wallet("0x" + privateKey);
                console.log("\n✅ Wallet loaded!");
                console.log("Address:", wallet.address);
            } catch (error) {
                console.error("\n❌ Invalid private key!");
                process.exit(1);
            }
            break;

        case "3":
            console.log("\nExiting...");
            process.exit(0);

        default:
            console.log("\nInvalid choice!");
            process.exit(1);
    }

    // Ask if user wants to save to .env
    const save = await question("\nDo you want to save this to .env file? (y/n): ");
    
    if (save.toLowerCase() === "y") {
        const envContent = `# Base Sepolia RPC URL
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Private key for deployment (without 0x prefix)
PRIVATE_KEY=${privateKey}

# Base Sepolia Explorer API Key (optional, for verification)
# Get from: https://basescan.org/myapikey
BASESCAN_API_KEY=

# Treasury address (defaults to deployer if not set)
TREASURY_ADDRESS=

# Platform fee in basis points (2000 = 20%)
PLATFORM_FEE_BPS=2000
`;
        
        fs.writeFileSync(".env", envContent);
        console.log("\n✅ Configuration saved to .env file!");
    }

    // Check balance on Base Sepolia
    console.log("\n🔍 Checking wallet balance on Base Sepolia...");
    const provider = new ethers.providers.JsonRpcProvider("https://sepolia.base.org");
    const connectedWallet = wallet.connect(provider);
    
    try {
        const balance = await connectedWallet.getBalance();
        console.log("Balance:", ethers.utils.formatEther(balance), "ETH");
        
        if (balance.eq(0)) {
            console.log("\n⚠️  Your wallet has no Base Sepolia ETH!");
            console.log("You need ETH to deploy contracts.");
            console.log("\nGet Base Sepolia ETH from:");
            console.log("1. https://www.alchemy.com/faucets/base-sepolia");
            console.log("2. https://faucet.quicknode.com/base/sepolia");
            console.log("3. Bridge from Sepolia: https://bridge.base.org/");
        } else {
            console.log("\n✅ Your wallet has sufficient balance for deployment!");
        }
    } catch (error) {
        console.log("⚠️  Could not check balance. Make sure you're connected to the internet.");
    }

    console.log("\n========================================");
    console.log("Setup Complete!");
    console.log("========================================");
    console.log("\nNext steps:");
    console.log("1. Ensure you have Base Sepolia ETH in your wallet");
    console.log("2. Run deployment: npm run deploy:base-sepolia");
    console.log("   or: npx hardhat run scripts/deploy-base-sepolia.js --network baseSepolia");
    console.log("\n========================================\n");

    rl.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});