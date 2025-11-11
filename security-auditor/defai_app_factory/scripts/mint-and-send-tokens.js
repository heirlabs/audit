// Script to mint tokens and send to specified address
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("========================================");
    console.log("Minting and Sending Tokens on Base Sepolia");
    console.log("========================================\n");

    // Target address
    const TARGET_ADDRESS = "0x48b2680068f311e7d777dc9502957325dae1df99";
    
    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Operating with account:", deployer.address);
    
    // Check balance
    const balance = await deployer.getBalance();
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");
    
    try {
        // First, let's check for existing deployment
        const deploymentFiles = fs.readdirSync('.').filter(f => f.startsWith('deployment-base-sepolia-'));
        
        let defaiTokenAddress;
        let appFactoryAddress;
        
        if (deploymentFiles.length > 0) {
            // Use the latest deployment
            const latestDeployment = deploymentFiles.sort().pop();
            const deploymentInfo = JSON.parse(fs.readFileSync(latestDeployment, 'utf8'));
            defaiTokenAddress = deploymentInfo.contracts.MockDefaiToken;
            appFactoryAddress = deploymentInfo.contracts.DefaiAppFactory;
            console.log("Using existing deployment from", latestDeployment);
            console.log("- MockDefaiToken:", defaiTokenAddress);
            console.log("- DefaiAppFactory:", appFactoryAddress);
        } else {
            // Deploy new contracts
            console.log("No existing deployment found. Deploying new contracts...\n");
            
            // Deploy MockDefaiToken
            console.log("1. Deploying MockDefaiToken...");
            const MockDefaiToken = await hre.ethers.getContractFactory("MockDefaiToken");
            const defaiToken = await MockDefaiToken.deploy();
            await defaiToken.deployed();
            console.log("✅ MockDefaiToken deployed to:", defaiToken.address);
            await defaiToken.deployTransaction.wait(3);
            defaiTokenAddress = defaiToken.address;
            
            // Deploy DefaiAppFactory
            console.log("\n2. Deploying DefaiAppFactory...");
            const DefaiAppFactory = await hre.ethers.getContractFactory("DefaiAppFactory");
            const appFactory = await DefaiAppFactory.deploy(
                defaiTokenAddress,
                deployer.address,
                2000 // 20% platform fee
            );
            await appFactory.deployed();
            console.log("✅ DefaiAppFactory deployed to:", appFactory.address);
            await appFactory.deployTransaction.wait(3);
            appFactoryAddress = appFactory.address;
            
            // Save deployment info
            const deploymentInfo = {
                network: "base-sepolia",
                chainId: 84532,
                deployer: deployer.address,
                contracts: {
                    MockDefaiToken: defaiTokenAddress,
                    DefaiAppFactory: appFactoryAddress
                },
                deployedAt: new Date().toISOString()
            };
            
            const fileName = `deployment-base-sepolia-${Date.now()}.json`;
            fs.writeFileSync(fileName, JSON.stringify(deploymentInfo, null, 2));
            console.log(`\n📁 Deployment info saved to ${fileName}`);
        }
        
        // Connect to contracts
        console.log("\n========================================");
        console.log("Minting and Sending Tokens");
        console.log("========================================\n");
        
        const MockDefaiToken = await hre.ethers.getContractFactory("MockDefaiToken");
        const defaiToken = MockDefaiToken.attach(defaiTokenAddress);
        
        // Check current balance of target address
        const currentBalance = await defaiToken.balanceOf(TARGET_ADDRESS);
        console.log("Current balance of", TARGET_ADDRESS);
        console.log("=>", ethers.utils.formatUnits(currentBalance, 6), "DEFAI\n");
        
        // Mint tokens to target address
        const AMOUNT_TO_MINT = ethers.utils.parseUnits("100000", 6); // 100,000 DEFAI tokens
        console.log("Minting", ethers.utils.formatUnits(AMOUNT_TO_MINT, 6), "DEFAI tokens...");
        
        const mintTx = await defaiToken.mint(TARGET_ADDRESS, AMOUNT_TO_MINT);
        console.log("Transaction hash:", mintTx.hash);
        console.log("Waiting for confirmation...");
        await mintTx.wait();
        console.log("✅ Tokens minted successfully!\n");
        
        // Also send some from the faucet
        console.log("Getting additional tokens from faucet to deployer...");
        const faucetTx = await defaiToken.faucet();
        await faucetTx.wait();
        console.log("✅ Faucet tokens received\n");
        
        // Transfer some faucet tokens to target
        const deployerBalance = await defaiToken.balanceOf(deployer.address);
        const transferAmount = ethers.utils.parseUnits("5000", 6); // 5,000 DEFAI
        
        if (deployerBalance.gte(transferAmount)) {
            console.log("Transferring", ethers.utils.formatUnits(transferAmount, 6), "DEFAI from deployer to target...");
            const transferTx = await defaiToken.transfer(TARGET_ADDRESS, transferAmount);
            await transferTx.wait();
            console.log("✅ Transfer completed!\n");
        }
        
        // Check final balance
        const finalBalance = await defaiToken.balanceOf(TARGET_ADDRESS);
        console.log("========================================");
        console.log("Final Results");
        console.log("========================================");
        console.log("Target Address:", TARGET_ADDRESS);
        console.log("Final Balance:", ethers.utils.formatUnits(finalBalance, 6), "DEFAI");
        console.log("\nContract Addresses:");
        console.log("- MockDefaiToken:", defaiTokenAddress);
        console.log("- DefaiAppFactory:", appFactoryAddress);
        console.log("\nView on Base Sepolia Explorer:");
        console.log("- Token:", `https://sepolia.basescan.org/address/${defaiTokenAddress}`);
        console.log("- Factory:", `https://sepolia.basescan.org/address/${appFactoryAddress}`);
        console.log("- Your wallet:", `https://sepolia.basescan.org/address/${TARGET_ADDRESS}`);
        console.log("\n✅ Tokens have been minted and sent successfully!");
        
    } catch (error) {
        console.error("\n❌ Operation failed!");
        console.error("Error:", error.message);
        if (error.error) {
            console.error("Details:", error.error);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });