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
    console.log("🚀 DEPLOYING UPGRADEABLE DEFAI STAKING TO BASE SEPOLIA");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");

    console.log("Using Shared Tokens:");
    console.log("- OLD DEFAI:", SHARED_TOKENS.OLD_DEFAI);
    console.log("- DEFAI:", SHARED_TOKENS.DEFAI);
    console.log("");

    try {
        // Deploy DefAI Staking Upgradeable
        console.log("📦 Deploying DefAI Staking (Upgradeable)");
        console.log("----------------------------------------");
        
        const DeFAIStakingUpgradeable = await ethers.getContractFactory("DeFAIStakingUpgradeable");
        const stakingProxy = await upgrades.deployProxy(
            DeFAIStakingUpgradeable,
            [SHARED_TOKENS.DEFAI, SHARED_TOKENS.OLD_DEFAI, deployer.address],
            { 
                initializer: 'initialize',
                kind: 'uups'
            }
        );
        await stakingProxy.deployed();
        const stakingAddress = stakingProxy.address;
        
        console.log("✅ DefAI Staking Proxy deployed to:", stakingAddress);
        const stakingImpl = await upgrades.erc1967.getImplementationAddress(stakingAddress);
        console.log("   Implementation:", stakingImpl);
        
        // Verify admin roles
        console.log("\n📝 Verifying Admin Roles:");
        const ADMIN_ROLE = await stakingProxy.ADMIN_ROLE();
        const PAUSER_ROLE = await stakingProxy.PAUSER_ROLE();
        const UPGRADER_ROLE = await stakingProxy.UPGRADER_ROLE();
        const BLACKLIST_ROLE = await stakingProxy.BLACKLIST_ROLE();
        
        console.log("- Admin has ADMIN_ROLE:", await stakingProxy.hasRole(ADMIN_ROLE, deployer.address));
        console.log("- Admin has PAUSER_ROLE:", await stakingProxy.hasRole(PAUSER_ROLE, deployer.address));
        console.log("- Admin has UPGRADER_ROLE:", await stakingProxy.hasRole(UPGRADER_ROLE, deployer.address));
        console.log("- Admin has BLACKLIST_ROLE:", await stakingProxy.hasRole(BLACKLIST_ROLE, deployer.address));

        // Fund escrow
        console.log("\nFunding staking escrow...");
        const defaiToken = await ethers.getContractAt("IERC20", SHARED_TOKENS.DEFAI);
        const fundAmount = ethers.utils.parseUnits("10000", 6); // 10,000 DEFAI
        
        // Check balance first
        const deployerBalance = await defaiToken.balanceOf(deployer.address);
        console.log("Deployer DEFAI balance:", ethers.utils.formatUnits(deployerBalance, 6));
        
        if (deployerBalance >= fundAmount) {
            await defaiToken.approve(stakingAddress, fundAmount);
            console.log("Approved tokens...");
            
            const tx = await stakingProxy.fundEscrow(fundAmount);
            await tx.wait();
            console.log("✅ Funded escrow with 10,000 DEFAI");
            
            const escrowBalance = await stakingProxy.escrowBalance();
            console.log("Escrow balance:", ethers.utils.formatUnits(escrowBalance, 6), "DEFAI");
        } else {
            console.log("⚠️ Insufficient DEFAI balance to fund escrow");
        }

        // Verify token configuration
        console.log("\n📦 Verifying Token Configuration");
        console.log("----------------------------------------");
        
        const stakingToken = await stakingProxy.defaiToken();
        const stakingOldToken = await stakingProxy.oldDefaiToken();
        
        console.log("Staking Contract:");
        console.log("- DEFAI Token:", stakingToken);
        console.log("- OLD DEFAI Token:", stakingOldToken);
        
        const tokensMatch = 
            stakingToken.toLowerCase() === SHARED_TOKENS.DEFAI.toLowerCase() &&
            stakingOldToken.toLowerCase() === SHARED_TOKENS.OLD_DEFAI.toLowerCase();
        
        if (tokensMatch) {
            console.log("\n✅ Tokens configured correctly!");
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
                defaiStaking: {
                    proxy: stakingAddress,
                    implementation: stakingImpl
                }
            }
        };

        const deploymentPath = path.join(__dirname, `../deployment-staking-upgradeable-${Date.now()}.json`);
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log(`\n📁 Deployment info saved to ${deploymentPath}`);

        // Summary
        console.log("\n========================================");
        console.log("🎉 DEPLOYMENT COMPLETE!");
        console.log("========================================\n");
        console.log("DefAI Staking Upgradeable:");
        console.log("├─ Proxy:", stakingAddress);
        console.log("└─ Implementation:", stakingImpl);
        console.log("\nShared Tokens:");
        console.log("├─ DEFAI:", SHARED_TOKENS.DEFAI);
        console.log("└─ OLD DEFAI:", SHARED_TOKENS.OLD_DEFAI);
        console.log("\n⚠️ Important:");
        console.log("- Contract is upgradeable (UUPS pattern)");
        console.log("- Admin can pause, upgrade, and blacklist");
        console.log("- Use proxy address for all interactions");
        console.log("\n🔍 View on Base Sepolia Explorer:");
        console.log(`https://sepolia.basescan.org/address/${stakingAddress}`);
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