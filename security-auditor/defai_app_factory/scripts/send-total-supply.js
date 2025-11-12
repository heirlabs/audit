// Script to send total supply to specified address
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("========================================");
    console.log("Sending Total Supply on Base Sepolia");
    console.log("========================================\n");

    // Target address
    const TARGET_ADDRESS = "0x48b2680068f311e7d777dc9502957325dae1df99";
    
    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Operating with account:", deployer.address);
    
    try {
        // Get existing deployment
        const deploymentFiles = fs.readdirSync('.').filter(f => f.startsWith('deployment-base-sepolia-'));
        
        if (deploymentFiles.length === 0) {
            console.error("No deployment found!");
            process.exit(1);
        }
        
        const latestDeployment = deploymentFiles.sort().pop();
        const deploymentInfo = JSON.parse(fs.readFileSync(latestDeployment, 'utf8'));
        const defaiTokenAddress = deploymentInfo.contracts.MockDefaiToken;
        
        console.log("Using MockDefaiToken at:", defaiTokenAddress);
        
        // Connect to contract
        const MockDefaiToken = await hre.ethers.getContractFactory("MockDefaiToken");
        const defaiToken = MockDefaiToken.attach(defaiTokenAddress);
        
        // Check current balances
        console.log("\n========================================");
        console.log("Current State");
        console.log("========================================\n");
        
        const totalSupply = await defaiToken.totalSupply();
        const deployerBalance = await defaiToken.balanceOf(deployer.address);
        const targetBalance = await defaiToken.balanceOf(TARGET_ADDRESS);
        
        console.log("Total Supply:", ethers.utils.formatUnits(totalSupply, 6), "DEFAI");
        console.log("Deployer Balance:", ethers.utils.formatUnits(deployerBalance, 6), "DEFAI");
        console.log("Target Current Balance:", ethers.utils.formatUnits(targetBalance, 6), "DEFAI\n");
        
        // Calculate amount to mint (total supply was 1 billion in constructor)
        // Let's mint the remaining amount to reach a very large supply
        const BILLION = ethers.utils.parseUnits("1000000000", 6);
        const amountToMint = BILLION.sub(targetBalance);
        
        console.log("========================================");
        console.log("Minting Maximum Supply");
        console.log("========================================\n");
        
        console.log("Minting", ethers.utils.formatUnits(amountToMint, 6), "DEFAI tokens to target...");
        
        // Mint the tokens
        const mintTx = await defaiToken.mint(TARGET_ADDRESS, amountToMint);
        console.log("Transaction hash:", mintTx.hash);
        console.log("Waiting for confirmation...");
        await mintTx.wait();
        console.log("✅ Tokens minted successfully!\n");
        
        // Transfer deployer's balance to target
        const currentDeployerBalance = await defaiToken.balanceOf(deployer.address);
        if (currentDeployerBalance.gt(0)) {
            console.log("Transferring deployer's", ethers.utils.formatUnits(currentDeployerBalance, 6), "DEFAI to target...");
            const transferTx = await defaiToken.transfer(TARGET_ADDRESS, currentDeployerBalance);
            await transferTx.wait();
            console.log("✅ Transfer completed!\n");
        }
        
        // Check final state
        const finalTotalSupply = await defaiToken.totalSupply();
        const finalTargetBalance = await defaiToken.balanceOf(TARGET_ADDRESS);
        const finalDeployerBalance = await defaiToken.balanceOf(deployer.address);
        
        console.log("========================================");
        console.log("Final Results");
        console.log("========================================");
        console.log("Target Address:", TARGET_ADDRESS);
        console.log("Final Total Supply:", ethers.utils.formatUnits(finalTotalSupply, 6), "DEFAI");
        console.log("Target Final Balance:", ethers.utils.formatUnits(finalTargetBalance, 6), "DEFAI");
        console.log("Deployer Final Balance:", ethers.utils.formatUnits(finalDeployerBalance, 6), "DEFAI");
        
        const percentage = finalTargetBalance.mul(10000).div(finalTotalSupply).toNumber() / 100;
        console.log("\n📊 Target owns", percentage.toFixed(2) + "% of total supply");
        
        console.log("\nView on Base Sepolia Explorer:");
        console.log("- Token:", `https://sepolia.basescan.org/address/${defaiTokenAddress}`);
        console.log("- Your wallet:", `https://sepolia.basescan.org/address/${TARGET_ADDRESS}`);
        console.log("\n✅ Total supply transfer completed!");
        
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