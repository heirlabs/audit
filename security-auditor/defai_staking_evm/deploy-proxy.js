// Deploy TransparentUpgradeableProxy for DeFAIStakingUpgradeable
const { ethers } = require("hardhat");
const fs = require("fs");

// Previously deployed contracts
const HEIR_TOKEN_ADDRESS = "0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42";
const IMPLEMENTATION_ADDRESS = "0xc30FcC9ad0F0233843F2171F587AE44086e92ffa"; // Latest implementation

async function main() {
    console.log("========================================");
    console.log("🚀 Deploying Proxy for DeFAIStakingUpgradeable");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await deployer.getBalance();
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");
    
    try {
        // 1. Deploy ProxyAdmin
        console.log("========================================");
        console.log("1. Deploying ProxyAdmin");
        console.log("========================================");
        
        const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy();
        await proxyAdmin.deployed();
        
        console.log("✅ ProxyAdmin deployed to:", proxyAdmin.address);
        console.log("   Waiting for confirmations...");
        await proxyAdmin.deployTransaction.wait(5);
        console.log("   Confirmed!\n");
        
        // 2. Deploy TransparentUpgradeableProxy
        console.log("========================================");
        console.log("2. Deploying TransparentUpgradeableProxy");
        console.log("========================================");
        
        const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
        
        // Encode initialization data
        const DeFAIStakingUpgradeable = await ethers.getContractFactory("DeFAIStakingUpgradeable");
        const initData = DeFAIStakingUpgradeable.interface.encodeFunctionData("initialize", [
            HEIR_TOKEN_ADDRESS,  // _defaiToken (HEIR token)
            HEIR_TOKEN_ADDRESS,  // _oldDefaiToken (same for now)
            deployer.address     // _admin
        ]);
        
        // Deploy proxy
        const proxy = await TransparentUpgradeableProxy.deploy(
            IMPLEMENTATION_ADDRESS,  // Implementation contract
            proxyAdmin.address,      // ProxyAdmin contract
            initData                 // Initialization data
        );
        await proxy.deployed();
        
        console.log("✅ Proxy deployed to:", proxy.address);
        console.log("   Implementation:", IMPLEMENTATION_ADDRESS);
        console.log("   ProxyAdmin:", proxyAdmin.address);
        console.log("   Waiting for confirmations...");
        await proxy.deployTransaction.wait(5);
        console.log("   Confirmed!\n");
        
        // 3. Connect to proxy as DeFAIStakingUpgradeable
        console.log("========================================");
        console.log("3. Verifying Proxy Setup");
        console.log("========================================");
        
        const stakingContract = DeFAIStakingUpgradeable.attach(proxy.address);
        
        // Verify initialization
        const defaiToken = await stakingContract.defaiToken();
        const oldDefaiToken = await stakingContract.oldDefaiToken();
        const totalStaked = await stakingContract.totalStaked();
        const paused = await stakingContract.paused();
        const owner = await stakingContract.owner();
        
        // Check roles
        const hasAdminRole = await stakingContract.hasRole(
            await stakingContract.ADMIN_ROLE(),
            deployer.address
        );
        const hasPauserRole = await stakingContract.hasRole(
            await stakingContract.PAUSER_ROLE(),
            deployer.address
        );
        const hasUpgraderRole = await stakingContract.hasRole(
            await stakingContract.UPGRADER_ROLE(),
            deployer.address
        );
        
        console.log("✅ Proxy initialized successfully!");
        console.log("\nConfiguration:");
        console.log("  HEIR Token:", defaiToken);
        console.log("  Old Token:", oldDefaiToken);
        console.log("  Total Staked:", ethers.utils.formatUnits(totalStaked, 6), "HEIR");
        console.log("  Owner:", owner);
        console.log("  Paused:", paused);
        console.log("\nAdmin Roles:");
        console.log("  ADMIN_ROLE:", hasAdminRole);
        console.log("  PAUSER_ROLE:", hasPauserRole);
        console.log("  UPGRADER_ROLE:", hasUpgraderRole);
        console.log();
        
        // 4. Save deployment information
        const deploymentInfo = {
            network: "base-sepolia",
            chainId: 84532,
            deployer: deployer.address,
            contracts: {
                MockHeirToken: HEIR_TOKEN_ADDRESS,
                DeFAIStakingUpgradeable: {
                    proxy: proxy.address,
                    implementation: IMPLEMENTATION_ADDRESS,
                    proxyAdmin: proxyAdmin.address
                }
            },
            configuration: {
                defaiToken: defaiToken,
                oldDefaiToken: oldDefaiToken,
                admin: deployer.address,
                owner: owner,
                tiers: {
                    gold: {
                        min: "10,000,000 HEIR",
                        max: "99,999,999 HEIR",
                        apy: "0.5%",
                        lockPeriod: "7 days"
                    },
                    titanium: {
                        min: "100,000,000 HEIR",
                        max: "999,999,999 HEIR",
                        apy: "0.75%",
                        lockPeriod: "7 days"
                    },
                    infinite: {
                        min: "1,000,000,000 HEIR",
                        max: "unlimited",
                        apy: "1%",
                        lockPeriod: "7 days"
                    }
                }
            },
            deployedAt: new Date().toISOString(),
            blockNumber: (await ethers.provider.getBlockNumber()),
            explorerUrls: {
                Proxy: `https://sepolia.basescan.org/address/${proxy.address}`,
                Implementation: `https://sepolia.basescan.org/address/${IMPLEMENTATION_ADDRESS}`,
                ProxyAdmin: `https://sepolia.basescan.org/address/${proxyAdmin.address}`,
                HeirToken: `https://sepolia.basescan.org/address/${HEIR_TOKEN_ADDRESS}`
            }
        };
        
        const fileName = `proxy-deployment-${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(deploymentInfo, null, 2));
        console.log(`📁 Deployment info saved to ${fileName}\n`);
        
        // 5. Display summary
        console.log("========================================");
        console.log("✅ PROXY DEPLOYMENT SUCCESSFUL!");
        console.log("========================================\n");
        console.log("🎯 STAKING CONTRACT ADDRESS (USE THIS):");
        console.log("  ", proxy.address);
        console.log("\n📋 All Addresses:");
        console.log("----------------------");
        console.log("Proxy (Staking):", proxy.address);
        console.log("ProxyAdmin:", proxyAdmin.address);
        console.log("Implementation:", IMPLEMENTATION_ADDRESS);
        console.log("HEIR Token:", HEIR_TOKEN_ADDRESS);
        console.log("\n💰 Staking Tiers:");
        console.log("-----------------");
        console.log("Gold:     10M-100M HEIR  @ 0.5% APY (7 days lock)");
        console.log("Titanium: 100M-1B HEIR   @ 0.75% APY (7 days lock)");
        console.log("Infinite: 1B+ HEIR       @ 1% APY (7 days lock)");
        console.log("\n🔗 Explorer Links:");
        console.log("------------------");
        console.log("Staking Contract:", `https://sepolia.basescan.org/address/${proxy.address}`);
        console.log("ProxyAdmin:", `https://sepolia.basescan.org/address/${proxyAdmin.address}`);
        console.log("\n📝 IMPORTANT:");
        console.log("-------------");
        console.log("1. ✅ Users can now stake at:", proxy.address);
        console.log("2. ⚠️  Fund the contract with HEIR tokens for rewards");
        console.log("3. 🔧 Admin can upgrade implementation if needed");
        console.log("4. 🔐 ProxyAdmin controls upgrades");
        console.log("5. ✅ All roles configured for", deployer.address);
        
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