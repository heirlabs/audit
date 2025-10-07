const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Shared token addresses from previous DefAI Swap deployment
const SHARED_TOKENS = {
    OLD_DEFAI: "0x143bB5907F6F69cEc597DA300f5979B536Dd0Bc3",
    DEFAI: "0x86938D567E7c77393aF32eC0E774100d84186558",
    NFT: "0x928AC6730A2A07D7D68F79b459E2256B38Ac0ecF"
};

async function main() {
    console.log("========================================");
    console.log("🚀 DEPLOYING UPGRADEABLE DEFAI APP FACTORY TO BASE SEPOLIA");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");

    console.log("Using Shared DEFAI Token:", SHARED_TOKENS.DEFAI);
    console.log("");

    try {
        // Deploy DefAI App Factory Upgradeable
        console.log("📦 Deploying DefAI App Factory (Upgradeable)");
        console.log("----------------------------------------");
        
        const DefaiAppFactoryUpgradeable = await ethers.getContractFactory("DefaiAppFactoryUpgradeable");
        const factoryProxy = await upgrades.deployProxy(
            DefaiAppFactoryUpgradeable,
            [SHARED_TOKENS.DEFAI, deployer.address, 2000], // 20% platform fee
            { 
                initializer: 'initialize',
                kind: 'uups'
            }
        );
        await factoryProxy.deployed();
        const factoryAddress = factoryProxy.address;
        
        console.log("✅ DefAI App Factory Proxy deployed to:", factoryAddress);
        const factoryImpl = await upgrades.erc1967.getImplementationAddress(factoryAddress);
        console.log("   Implementation:", factoryImpl);
        
        // Verify admin roles
        console.log("\n📝 Verifying Admin Roles:");
        const ADMIN_ROLE = await factoryProxy.ADMIN_ROLE();
        const PAUSER_ROLE = await factoryProxy.PAUSER_ROLE();
        const UPGRADER_ROLE = await factoryProxy.UPGRADER_ROLE();
        const BLACKLIST_ROLE = await factoryProxy.BLACKLIST_ROLE();
        const TREASURY_ROLE = await factoryProxy.TREASURY_ROLE();
        
        console.log("- Admin has ADMIN_ROLE:", await factoryProxy.hasRole(ADMIN_ROLE, deployer.address));
        console.log("- Admin has PAUSER_ROLE:", await factoryProxy.hasRole(PAUSER_ROLE, deployer.address));
        console.log("- Admin has UPGRADER_ROLE:", await factoryProxy.hasRole(UPGRADER_ROLE, deployer.address));
        console.log("- Admin has BLACKLIST_ROLE:", await factoryProxy.hasRole(BLACKLIST_ROLE, deployer.address));
        console.log("- Admin has TREASURY_ROLE:", await factoryProxy.hasRole(TREASURY_ROLE, deployer.address));

        // Test app registration
        console.log("\n📦 Testing App Registration");
        console.log("----------------------------------------");
        
        try {
            const appPrice = ethers.utils.parseUnits("100", 6); // 100 DEFAI
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
            console.log("⚠️ App registration test failed (this is expected if no funds)");
        }

        // Verify token configuration
        console.log("\n📦 Verifying Token Configuration");
        console.log("----------------------------------------");
        
        const factoryToken = await factoryProxy.defaiToken();
        console.log("App Factory DEFAI Token:", factoryToken);
        
        const tokenMatch = factoryToken.toLowerCase() === SHARED_TOKENS.DEFAI.toLowerCase();
        
        if (tokenMatch) {
            console.log("\n✅ Token configured correctly!");
        } else {
            console.log("\n⚠️ Token configuration mismatch!");
        }

        // Save deployment info
        const deploymentInfo = {
            network: "Base Sepolia",
            chainId: 84532,
            deployer: deployer.address,
            timestamp: Date.now(),
            sharedTokens: SHARED_TOKENS,
            contracts: {
                defaiAppFactory: {
                    proxy: factoryAddress,
                    implementation: factoryImpl
                }
            }
        };

        const deploymentPath = path.join(__dirname, `../deployment-factory-upgradeable-${Date.now()}.json`);
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log(`\n📁 Deployment info saved to ${deploymentPath}`);

        // Summary
        console.log("\n========================================");
        console.log("🎉 DEPLOYMENT COMPLETE!");
        console.log("========================================\n");
        console.log("DefAI App Factory Upgradeable:");
        console.log("├─ Proxy:", factoryAddress);
        console.log("└─ Implementation:", factoryImpl);
        console.log("\nShared Token:");
        console.log("└─ DEFAI:", SHARED_TOKENS.DEFAI);
        console.log("\n⚠️ Important:");
        console.log("- Contract is upgradeable (UUPS pattern)");
        console.log("- Admin can pause, upgrade, and blacklist");
        console.log("- Platform fee set to 20%");
        console.log("- Use proxy address for all interactions");
        console.log("\n🔍 View on Base Sepolia Explorer:");
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