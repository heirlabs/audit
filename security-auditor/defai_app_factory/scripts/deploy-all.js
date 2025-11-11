// Comprehensive deployment script for all contracts
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("========================================");
    console.log("🚀 Deploying All Contracts to Base Sepolia");
    console.log("========================================\n");

    // Configuration
    const TARGET_ADDRESS = "0x48b2680068f311e7d777dc9502957325dae1df99";
    const PLATFORM_FEE_BPS = 2000; // 20%
    
    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Check balance
    const balance = await deployer.getBalance();
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");
    
    if (balance.lt(ethers.utils.parseEther("0.01"))) {
        console.error("❌ Insufficient ETH balance for deployment!");
        process.exit(1);
    }
    
    try {
        // 1. Deploy MockHeirToken
        console.log("========================================");
        console.log("1. Deploying MockHeirToken");
        console.log("========================================");
        
        const MockHeirToken = await hre.ethers.getContractFactory("MockHeirToken");
        const heirToken = await MockHeirToken.deploy();
        await heirToken.deployed();
        console.log("✅ MockHeirToken deployed to:", heirToken.address);
        
        // Wait for confirmation
        await heirToken.deployTransaction.wait(3);
        console.log("   Transaction confirmed!\n");
        
        // Get total supply
        const totalSupply = await heirToken.totalSupply();
        console.log("   Total Supply:", ethers.utils.formatUnits(totalSupply, 6), "HEIR");
        
        // 2. Deploy DefaiAppFactory
        console.log("========================================");
        console.log("2. Deploying DefaiAppFactory");
        console.log("========================================");
        
        const DefaiAppFactory = await hre.ethers.getContractFactory("DefaiAppFactory");
        const appFactory = await DefaiAppFactory.deploy(
            heirToken.address,
            deployer.address, // Treasury initially set to deployer
            PLATFORM_FEE_BPS
        );
        await appFactory.deployed();
        console.log("✅ DefaiAppFactory deployed to:", appFactory.address);
        
        // Wait for confirmation
        await appFactory.deployTransaction.wait(3);
        console.log("   Transaction confirmed!");
        console.log("   Staking Token:", heirToken.address);
        console.log("   Treasury:", deployer.address);
        console.log("   Platform Fee:", PLATFORM_FEE_BPS / 100, "%\n");
        
        // 3. Transfer 50% of tokens to target address
        console.log("========================================");
        console.log("3. Transferring 50% of Supply to Target");
        console.log("========================================");
        
        const halfSupply = totalSupply.div(2);
        console.log("Transferring", ethers.utils.formatUnits(halfSupply, 6), "HEIR to", TARGET_ADDRESS);
        
        const transferTx = await heirToken.transfer(TARGET_ADDRESS, halfSupply);
        console.log("Transfer tx hash:", transferTx.hash);
        await transferTx.wait();
        console.log("✅ Transfer completed!\n");
        
        // 4. Verify balances
        console.log("========================================");
        console.log("4. Verifying Final Balances");
        console.log("========================================");
        
        const deployerBalance = await heirToken.balanceOf(deployer.address);
        const targetBalance = await heirToken.balanceOf(TARGET_ADDRESS);
        
        console.log("Deployer HEIR balance:", ethers.utils.formatUnits(deployerBalance, 6));
        console.log("Target HEIR balance:", ethers.utils.formatUnits(targetBalance, 6));
        console.log("Total accounted:", ethers.utils.formatUnits(deployerBalance.add(targetBalance), 6), "\n");
        
        // 5. Save deployment information
        const deploymentInfo = {
            network: "base-sepolia",
            chainId: 84532,
            deployer: deployer.address,
            contracts: {
                MockHeirToken: heirToken.address,
                DefaiAppFactory: appFactory.address
            },
            tokenInfo: {
                name: "Mock Heir Token",
                symbol: "HEIR",
                decimals: 6,
                totalSupply: ethers.utils.formatUnits(totalSupply, 6),
                deployerBalance: ethers.utils.formatUnits(deployerBalance, 6),
                targetBalance: ethers.utils.formatUnits(targetBalance, 6),
                targetAddress: TARGET_ADDRESS
            },
            factoryInfo: {
                treasury: deployer.address,
                platformFeeBps: PLATFORM_FEE_BPS,
                stakingToken: heirToken.address
            },
            deployedAt: new Date().toISOString(),
            blockNumber: (await ethers.provider.getBlockNumber()),
            explorerUrls: {
                MockHeirToken: `https://sepolia.basescan.org/address/${heirToken.address}`,
                DefaiAppFactory: `https://sepolia.basescan.org/address/${appFactory.address}`,
                Deployer: `https://sepolia.basescan.org/address/${deployer.address}`,
                Target: `https://sepolia.basescan.org/address/${TARGET_ADDRESS}`
            }
        };
        
        const fileName = `deployment-base-sepolia-${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(deploymentInfo, null, 2));
        console.log(`📁 Deployment info saved to ${fileName}\n`);
        
        // 6. Update .env file with new token address
        const envContent = fs.readFileSync('.env', 'utf8');
        const updatedEnv = envContent.replace(
            /HEIR_TOKEN_ADDRESS=.*/g,
            `HEIR_TOKEN_ADDRESS=${heirToken.address}`
        );
        
        // Add token address if not present
        if (!updatedEnv.includes('HEIR_TOKEN_ADDRESS=')) {
            fs.appendFileSync('.env', `\n# Deployed Contract Addresses\nHEIR_TOKEN_ADDRESS=${heirToken.address}\nAPP_FACTORY_ADDRESS=${appFactory.address}\n`);
        } else {
            fs.writeFileSync('.env', updatedEnv);
        }
        
        // 7. Display summary
        console.log("========================================");
        console.log("✅ DEPLOYMENT SUCCESSFUL!");
        console.log("========================================\n");
        console.log("📋 Summary:");
        console.log("------------");
        console.log("MockHeirToken:", heirToken.address);
        console.log("DefaiAppFactory:", appFactory.address);
        console.log("\n💰 Token Distribution:");
        console.log("----------------------");
        console.log("Deployer:", ethers.utils.formatUnits(deployerBalance, 6), "HEIR");
        console.log("Target:", ethers.utils.formatUnits(targetBalance, 6), "HEIR");
        console.log("\n🔗 Explorer Links:");
        console.log("------------------");
        console.log("Token:", `https://sepolia.basescan.org/address/${heirToken.address}`);
        console.log("Factory:", `https://sepolia.basescan.org/address/${appFactory.address}`);
        console.log("\n📝 Next Steps:");
        console.log("--------------");
        console.log("1. The DefaiAppFactory can now accept HEIR token for staking");
        console.log("2. You can update the staking token address using updateStakingToken()");
        console.log("3. Users can create apps and stake HEIR tokens");
        console.log("4. 50% of the supply has been sent to:", TARGET_ADDRESS);
        
    } catch (error) {
        console.error("\n❌ Deployment failed!");
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