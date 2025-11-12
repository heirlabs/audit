// Script to transfer 50% of tokens and ETH from deployer to target address
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("========================================");
    console.log("Transferring 50% of Tokens and ETH");
    console.log("========================================\n");

    // Target address
    const TARGET_ADDRESS = "0x48b2680068f311e7d777dc9502957325dae1df99";
    
    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Deployer account:", deployer.address);
    
    try {
        // Get deployment info
        const deploymentFiles = fs.readdirSync('.').filter(f => f.startsWith('deployment-base-sepolia-'));
        
        if (deploymentFiles.length === 0) {
            console.error("❌ No deployment file found!");
            process.exit(1);
        }
        
        const latestDeployment = deploymentFiles.sort().pop();
        const deploymentInfo = JSON.parse(fs.readFileSync(latestDeployment, 'utf8'));
        const defaiTokenAddress = deploymentInfo.contracts.MockDefaiToken;
        
        console.log("Using MockDefaiToken at:", defaiTokenAddress);
        console.log("Target address:", TARGET_ADDRESS, "\n");
        
        // Connect to token contract
        const MockDefaiToken = await hre.ethers.getContractFactory("MockDefaiToken");
        const defaiToken = MockDefaiToken.attach(defaiTokenAddress);
        
        // Check ETH balance
        const ethBalance = await deployer.getBalance();
        console.log("Current ETH balance:", ethers.utils.formatEther(ethBalance), "ETH");
        
        // Check token balance
        const tokenBalance = await defaiToken.balanceOf(deployer.address);
        console.log("Current DEFAI token balance:", ethers.utils.formatUnits(tokenBalance, 6), "DEFAI");
        
        if (tokenBalance.isZero() && ethBalance.isZero()) {
            console.log("\n⚠️  Both ETH and token balances are zero. Nothing to transfer.");
            process.exit(0);
        }
        
        console.log("\n========================================");
        console.log("Executing Transfers");
        console.log("========================================\n");
        
        // Transfer 50% of tokens if balance > 0
        if (!tokenBalance.isZero()) {
            const tokensToSend = tokenBalance.div(2);
            console.log(`Sending 50% of tokens (${ethers.utils.formatUnits(tokensToSend, 6)} DEFAI)...`);
            
            const tokenTx = await defaiToken.transfer(TARGET_ADDRESS, tokensToSend);
            console.log("Token transfer tx hash:", tokenTx.hash);
            await tokenTx.wait();
            console.log("✅ Token transfer completed!\n");
        } else {
            console.log("⚠️  No DEFAI tokens to transfer\n");
        }
        
        // Transfer 50% of ETH if balance > 0 (keeping some for gas)
        const minGasReserve = ethers.utils.parseEther("0.001"); // Keep 0.001 ETH for gas
        
        if (ethBalance.gt(minGasReserve.mul(2))) {
            // Calculate 50% but ensure we keep minimum gas reserve
            const halfEth = ethBalance.div(2);
            const ethToSend = halfEth.sub(minGasReserve); // Keep some for gas
            
            console.log(`Sending ETH (${ethers.utils.formatEther(ethToSend)} ETH)...`);
            console.log(`Keeping ${ethers.utils.formatEther(minGasReserve)} ETH for gas`);
            
            const ethTx = await deployer.sendTransaction({
                to: TARGET_ADDRESS,
                value: ethToSend
            });
            console.log("ETH transfer tx hash:", ethTx.hash);
            await ethTx.wait();
            console.log("✅ ETH transfer completed!\n");
        } else {
            console.log("⚠️  Insufficient ETH balance for transfer (need to keep gas reserve)\n");
        }
        
        // Check final balances
        console.log("========================================");
        console.log("Final Balances");
        console.log("========================================\n");
        
        const finalEthBalance = await deployer.getBalance();
        const finalTokenBalance = await defaiToken.balanceOf(deployer.address);
        const targetEthBalance = await ethers.provider.getBalance(TARGET_ADDRESS);
        const targetTokenBalance = await defaiToken.balanceOf(TARGET_ADDRESS);
        
        console.log("Deployer:");
        console.log("  - ETH:", ethers.utils.formatEther(finalEthBalance));
        console.log("  - DEFAI:", ethers.utils.formatUnits(finalTokenBalance, 6));
        
        console.log("\nTarget Address:");
        console.log("  - ETH:", ethers.utils.formatEther(targetEthBalance));
        console.log("  - DEFAI:", ethers.utils.formatUnits(targetTokenBalance, 6));
        
        console.log("\n✅ Transfer operation completed!");
        console.log("\nView on Base Sepolia Explorer:");
        console.log("- Deployer:", `https://sepolia.basescan.org/address/${deployer.address}`);
        console.log("- Target:", `https://sepolia.basescan.org/address/${TARGET_ADDRESS}`);
        
    } catch (error) {
        console.error("\n❌ Transfer failed!");
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