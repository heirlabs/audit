const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Starting DefAI Estate deployment to Base Sepolia...\n");

    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Check balance
    const balance = await deployer.getBalance();
    const balanceInEth = hre.ethers.utils.formatEther(balance);
    console.log("Account balance:", balanceInEth, "ETH");
    
    if (parseFloat(balanceInEth) < 0.01) {
        console.error("\n❌ Insufficient balance for deployment!");
        console.error("Please fund your wallet with Base Sepolia ETH");
        process.exit(1);
    }

    // Deploy DefAIEstateMinimal (optimized for testnet)
    console.log("\n1. Deploying DefAIEstateMinimal...");
    const DefAIEstate = await hre.ethers.getContractFactory("DefAIEstateMinimal");
    
    const gasPrice = await deployer.getGasPrice();
    console.log("Current gas price:", hre.ethers.utils.formatUnits(gasPrice, "gwei"), "gwei");
    
    const defaiEstate = await DefAIEstate.deploy({
        gasLimit: 5000000,
        gasPrice: gasPrice.mul(110).div(100) // 10% buffer
    });
    
    console.log("Transaction hash:", defaiEstate.deployTransaction.hash);
    console.log("Waiting for confirmation...");
    
    await defaiEstate.deployed();
    console.log("✅ DefAIEstateMinimal deployed to:", defaiEstate.address);

    // Deploy TokenVault
    console.log("\n2. Deploying TokenVault...");
    const TokenVault = await hre.ethers.getContractFactory("TokenVault");
    const tokenVault = await TokenVault.deploy(defaiEstate.address, {
        gasLimit: 3000000,
        gasPrice: gasPrice.mul(110).div(100)
    });
    
    console.log("Transaction hash:", tokenVault.deployTransaction.hash);
    await tokenVault.deployed();
    console.log("✅ TokenVault deployed to:", tokenVault.address);

    // Deploy EmergencyManager
    console.log("\n3. Deploying EmergencyManager...");
    const EmergencyManager = await hre.ethers.getContractFactory("EmergencyManager");
    const emergencyManager = await EmergencyManager.deploy(defaiEstate.address, {
        gasLimit: 3000000,
        gasPrice: gasPrice.mul(110).div(100)
    });
    
    console.log("Transaction hash:", emergencyManager.deployTransaction.hash);
    await emergencyManager.deployed();
    console.log("✅ EmergencyManager deployed to:", emergencyManager.address);

    // Save deployment info
    const deploymentInfo = {
        network: "Base Sepolia",
        chainId: 84532,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            DefAIEstateMinimal: {
                address: defaiEstate.address,
                txHash: defaiEstate.deployTransaction.hash,
                blockNumber: defaiEstate.deployTransaction.blockNumber
            },
            TokenVault: {
                address: tokenVault.address,
                txHash: tokenVault.deployTransaction.hash,
                blockNumber: tokenVault.deployTransaction.blockNumber
            },
            EmergencyManager: {
                address: emergencyManager.address,
                txHash: emergencyManager.deployTransaction.hash,
                blockNumber: emergencyManager.deployTransaction.blockNumber
            }
        },
        explorer: {
            baseUrl: "https://sepolia.basescan.org",
            contracts: {
                DefAIEstateMinimal: `https://sepolia.basescan.org/address/${defaiEstate.address}`,
                TokenVault: `https://sepolia.basescan.org/address/${tokenVault.address}`,
                EmergencyManager: `https://sepolia.basescan.org/address/${emergencyManager.address}`
            }
        }
    };

    // Save to file
    const deploymentsPath = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentsPath)) {
        fs.mkdirSync(deploymentsPath);
    }

    const deploymentFile = path.join(deploymentsPath, 'base-sepolia-deployment.json');
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

    // Final balance check
    const finalBalance = await deployer.getBalance();
    const finalBalanceInEth = hre.ethers.utils.formatEther(finalBalance);
    const gasUsed = parseFloat(balanceInEth) - parseFloat(finalBalanceInEth);

    console.log("\n" + "=".repeat(60));
    console.log("✅ DEPLOYMENT SUCCESSFUL!");
    console.log("=".repeat(60));
    console.log("\n📋 Deployment Summary:");
    console.log("Network: Base Sepolia (Chain ID: 84532)");
    console.log("Deployer:", deployer.address);
    console.log("\n📍 Contract Addresses:");
    console.log("DefAIEstateMinimal:", defaiEstate.address);
    console.log("TokenVault:", tokenVault.address);
    console.log("EmergencyManager:", emergencyManager.address);
    console.log("\n💰 Gas Usage:");
    console.log("Initial balance:", balanceInEth, "ETH");
    console.log("Final balance:", finalBalanceInEth, "ETH");
    console.log("Total gas used:", gasUsed.toFixed(6), "ETH");
    console.log("\n🔍 View on Explorer:");
    console.log("DefAIEstateMinimal:", deploymentInfo.explorer.contracts.DefAIEstateMinimal);
    console.log("TokenVault:", deploymentInfo.explorer.contracts.TokenVault);
    console.log("EmergencyManager:", deploymentInfo.explorer.contracts.EmergencyManager);
    console.log("\n📁 Deployment info saved to:", deploymentFile);
    
    // Test basic functionality
    console.log("\n🧪 Testing basic functionality...");
    try {
        const name = await defaiEstate.name();
        const symbol = await defaiEstate.symbol();
        console.log("Token Name:", name);
        console.log("Token Symbol:", symbol);
        console.log("✅ Contracts are functional!");
    } catch (error) {
        console.error("⚠️ Error testing contracts:", error.message);
    }
    
    console.log("\n🎉 Deployment complete! Your DefAI Estate contracts are live on Base Sepolia!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });