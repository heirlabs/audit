// Fresh deployment of DeFAIStakingUpgradeable
const { ethers } = require("hardhat");
const fs = require("fs");

// Previously deployed MockHeirToken address
const HEIR_TOKEN_ADDRESS = "0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42";

async function main() {
    console.log("========================================");
    console.log("🚀 Fresh Deployment of DeFAIStakingUpgradeable");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await deployer.getBalance();
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");
    
    try {
        // Deploy fresh implementation without proxy for now
        console.log("========================================");
        console.log("1. Deploying DeFAIStakingUpgradeable Implementation");
        console.log("========================================");
        
        const DeFAIStakingUpgradeable = await ethers.getContractFactory("DeFAIStakingUpgradeable");
        
        // Deploy implementation
        const staking = await DeFAIStakingUpgradeable.deploy();
        await staking.deployed();
        
        console.log("✅ Implementation deployed to:", staking.address);
        console.log("   Waiting for confirmations...");
        await staking.deployTransaction.wait(5);
        
        // Initialize
        console.log("\n2. Initializing contract...");
        const initTx = await staking.initialize(
            HEIR_TOKEN_ADDRESS,  // _defaiToken (new token)
            HEIR_TOKEN_ADDRESS,  // _oldDefaiToken (same for now)
            deployer.address     // _admin
        );
        await initTx.wait();
        console.log("✅ Contract initialized\n");
        
        // 3. Verify configuration
        console.log("========================================");
        console.log("3. Verifying Configuration");
        console.log("========================================");
        
        const defaiToken = await staking.defaiToken();
        const oldDefaiToken = await staking.oldDefaiToken();
        const totalStaked = await staking.totalStaked();
        const paused = await staking.paused();
        const owner = await staking.owner();
        
        // Check admin roles
        const hasAdminRole = await staking.hasRole(await staking.ADMIN_ROLE(), deployer.address);
        const hasPauserRole = await staking.hasRole(await staking.PAUSER_ROLE(), deployer.address);
        const hasUpgraderRole = await staking.hasRole(await staking.UPGRADER_ROLE(), deployer.address);
        
        console.log("Current HEIR Token:", defaiToken);
        console.log("Old Token (migration):", oldDefaiToken);
        console.log("Total Staked:", ethers.utils.formatUnits(totalStaked, 6), "HEIR");
        console.log("Contract Owner:", owner);
        console.log("Contract Paused:", paused);
        console.log("\nAdmin Roles:");
        console.log("  Has ADMIN_ROLE:", hasAdminRole);
        console.log("  Has PAUSER_ROLE:", hasPauserRole);
        console.log("  Has UPGRADER_ROLE:", hasUpgraderRole);
        console.log();
        
        // 4. Save deployment information
        const deploymentInfo = {
            network: "base-sepolia",
            chainId: 84532,
            deployer: deployer.address,
            contracts: {
                MockHeirToken: HEIR_TOKEN_ADDRESS,
                DeFAIStakingUpgradeable: staking.address
            },
            configuration: {
                defaiToken: defaiToken,
                oldDefaiToken: oldDefaiToken,
                admin: deployer.address,
                owner: owner,
                isUpgradeable: true,
                tiers: {
                    gold: {
                        id: 0,
                        min: "10000000 HEIR",
                        max: "99999999 HEIR",
                        apy: "0.5%",
                        lockPeriod: "7 days"
                    },
                    titanium: {
                        id: 1,
                        min: "100000000 HEIR",
                        max: "999999999 HEIR",
                        apy: "0.75%",
                        lockPeriod: "7 days"
                    },
                    infinite: {
                        id: 2,
                        min: "1000000000 HEIR",
                        max: "unlimited",
                        apy: "1%",
                        lockPeriod: "7 days"
                    }
                }
            },
            deployedAt: new Date().toISOString(),
            blockNumber: (await ethers.provider.getBlockNumber()),
            explorerUrls: {
                MockHeirToken: `https://sepolia.basescan.org/address/${HEIR_TOKEN_ADDRESS}`,
                DeFAIStakingUpgradeable: `https://sepolia.basescan.org/address/${staking.address}`
            }
        };
        
        const fileName = `staking-deployment-${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(deploymentInfo, null, 2));
        console.log(`📁 Deployment info saved to ${fileName}\n`);
        
        // 5. Display summary
        console.log("========================================");
        console.log("✅ STAKING DEPLOYMENT SUCCESSFUL!");
        console.log("========================================\n");
        console.log("📋 Contract Addresses:");
        console.log("----------------------");
        console.log("MockHeirToken:", HEIR_TOKEN_ADDRESS);
        console.log("DeFAIStakingUpgradeable:", staking.address);
        console.log("\n💰 Staking Tiers (Pre-configured):");
        console.log("-----------------------------------");
        console.log("Gold:     10M-100M HEIR  @ 0.5% APY");
        console.log("Titanium: 100M-1B HEIR   @ 0.75% APY");
        console.log("Infinite: 1B+ HEIR       @ 1% APY");
        console.log("\n🔗 Explorer Links:");
        console.log("------------------");
        console.log("Staking:", `https://sepolia.basescan.org/address/${staking.address}`);
        console.log("Token:", `https://sepolia.basescan.org/address/${HEIR_TOKEN_ADDRESS}`);
        console.log("\n📝 IMPORTANT Next Steps:");
        console.log("------------------------");
        console.log("1. ⚠️  FUND THE CONTRACT: Send HEIR tokens to", staking.address);
        console.log("2. Users can stake after funding");
        console.log("3. Admin can pause/unpause contract");
        console.log("4. Contract supports future upgrades");
        console.log("5. All lock periods are 7 days by default");
        
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