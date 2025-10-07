const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Shared token addresses from previous deployment
const SHARED_TOKENS = {
    OLD_DEFAI: "0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3", // From DefAI Swap deployment
    DEFAI: "0x86938D567E7c77393aF32eC0E774100d84186558", // From DefAI Swap deployment  
    NFT: "0x928AC6730A2A07D7D68F79b459E2256B38Ac0ecF" // From DefAI Swap deployment
};

async function main() {
    console.log("========================================");
    console.log("🚀 DEPLOYING UPGRADEABLE CONTRACTS TO BASE SEPOLIA");
    console.log("========================================\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

    console.log("Using Shared Tokens:");
    console.log("- OLD DEFAI:", SHARED_TOKENS.OLD_DEFAI);
    console.log("- DEFAI:", SHARED_TOKENS.DEFAI);
    console.log("- NFT:", SHARED_TOKENS.NFT);
    console.log("");

    const deploymentInfo = {
        network: "Base Sepolia",
        chainId: 84532,
        deployer: deployer.address,
        timestamp: Date.now(),
        sharedTokens: SHARED_TOKENS,
        contracts: {}
    };

    try {
        // ========================================
        // Deploy DefAI Staking Upgradeable
        // ========================================
        console.log("📦 1. Deploying DefAI Staking (Upgradeable)");
        console.log("----------------------------------------");
        
        const DeFAIStakingUpgradeable = await hre.ethers.getContractFactory("DeFAIStakingUpgradeable");
        const stakingProxy = await hre.upgrades.deployProxy(
            DeFAIStakingUpgradeable,
            [SHARED_TOKENS.DEFAI, SHARED_TOKENS.OLD_DEFAI, deployer.address],
            { 
                initializer: 'initialize',
                kind: 'uups'
            }
        );
        await stakingProxy.waitForDeployment();
        const stakingAddress = await stakingProxy.getAddress();
        
        console.log("✅ DefAI Staking Proxy deployed to:", stakingAddress);
        const stakingImpl = await hre.upgrades.erc1967.getImplementationAddress(stakingAddress);
        console.log("   Implementation:", stakingImpl);
        
        deploymentInfo.contracts.defaiStaking = {
            proxy: stakingAddress,
            implementation: stakingImpl
        };

        // Fund escrow
        console.log("\nFunding staking escrow...");
        const defaiToken = await hre.ethers.getContractAt("IERC20", SHARED_TOKENS.DEFAI);
        const fundAmount = hre.ethers.parseUnits("10000", 6); // 10,000 DEFAI
        
        // Check balance first
        const deployerBalance = await defaiToken.balanceOf(deployer.address);
        console.log("Deployer DEFAI balance:", hre.ethers.formatUnits(deployerBalance, 6));
        
        if (deployerBalance >= fundAmount) {
            await defaiToken.approve(stakingAddress, fundAmount);
            await stakingProxy.fundEscrow(fundAmount);
            console.log("✅ Funded escrow with 10,000 DEFAI");
        } else {
            console.log("⚠️ Insufficient DEFAI balance to fund escrow");
        }

        // ========================================
        // Deploy DefAI App Factory Upgradeable
        // ========================================
        console.log("\n📦 2. Deploying DefAI App Factory (Upgradeable)");
        console.log("----------------------------------------");
        
        const DefaiAppFactoryUpgradeable = await hre.ethers.getContractFactory("DefaiAppFactoryUpgradeable");
        const factoryProxy = await hre.upgrades.deployProxy(
            DefaiAppFactoryUpgradeable,
            [SHARED_TOKENS.DEFAI, deployer.address, 2000], // 20% platform fee
            { 
                initializer: 'initialize',
                kind: 'uups'
            }
        );
        await factoryProxy.waitForDeployment();
        const factoryAddress = await factoryProxy.getAddress();
        
        console.log("✅ DefAI App Factory Proxy deployed to:", factoryAddress);
        const factoryImpl = await hre.upgrades.erc1967.getImplementationAddress(factoryAddress);
        console.log("   Implementation:", factoryImpl);
        
        deploymentInfo.contracts.defaiAppFactory = {
            proxy: factoryAddress,
            implementation: factoryImpl
        };

        // ========================================
        // Verify Token Configuration
        // ========================================
        console.log("\n📦 3. Verifying Token Configuration");
        console.log("----------------------------------------");
        
        const stakingToken = await stakingProxy.defaiToken();
        const stakingOldToken = await stakingProxy.oldDefaiToken();
        const factoryToken = await factoryProxy.defaiToken();
        
        console.log("Staking Contract:");
        console.log("- DEFAI Token:", stakingToken);
        console.log("- OLD DEFAI Token:", stakingOldToken);
        console.log("\nApp Factory Contract:");
        console.log("- DEFAI Token:", factoryToken);
        
        const tokensMatch = 
            stakingToken.toLowerCase() === SHARED_TOKENS.DEFAI.toLowerCase() &&
            stakingOldToken.toLowerCase() === SHARED_TOKENS.OLD_DEFAI.toLowerCase() &&
            factoryToken.toLowerCase() === SHARED_TOKENS.DEFAI.toLowerCase();
        
        if (tokensMatch) {
            console.log("\n✅ All contracts configured with correct shared tokens!");
        } else {
            console.log("\n⚠️ Token configuration mismatch detected!");
        }

        // ========================================
        // Test App Registration
        // ========================================
        console.log("\n📦 4. Testing App Registration");
        console.log("----------------------------------------");
        
        try {
            const appPrice = hre.ethers.parseUnits("100", 6); // 100 DEFAI
            const tx = await factoryProxy.registerApp(
                appPrice,
                1000, // max supply
                "ipfs://QmTest123" // metadata URI
            );
            await tx.wait();
            
            const totalApps = await factoryProxy.getTotalApps();
            console.log("✅ Test app registered successfully!");
            console.log("   Total apps:", totalApps.toString());
        } catch (error) {
            console.log("⚠️ App registration test failed:", error.message);
        }

        // ========================================
        // Save Deployment Info
        // ========================================
        const deploymentPath = path.join(
            __dirname,
            `../deployment-upgradeable-${Date.now()}.json`
        );
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log(`\n📁 Deployment info saved to ${deploymentPath}`);

        // ========================================
        // Summary
        // ========================================
        console.log("\n========================================");
        console.log("🎉 DEPLOYMENT COMPLETE!");
        console.log("========================================\n");
        console.log("Shared Tokens (from previous deployment):");
        console.log("├─ OLD DEFAI:", SHARED_TOKENS.OLD_DEFAI);
        console.log("├─ DEFAI:", SHARED_TOKENS.DEFAI);
        console.log("└─ NFT:", SHARED_TOKENS.NFT);
        console.log("\nUpgradeable Contracts:");
        console.log("├─ Staking Proxy:", stakingAddress);
        console.log("└─ App Factory Proxy:", factoryAddress);
        console.log("\n⚠️ Important Notes:");
        console.log("1. All contracts are upgradeable (UUPS pattern)");
        console.log("2. Use proxy addresses for all interactions");
        console.log("3. Admin roles granted to deployer");
        console.log("4. Contracts can be paused/upgraded by admin");
        console.log("\n🔍 View on Base Sepolia Explorer:");
        console.log(`https://sepolia.basescan.org/address/${stakingAddress}`);
        console.log(`https://sepolia.basescan.org/address/${factoryAddress}`);
        console.log("========================================");

    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });