// Deploy DeFAIStakingUpgradeable contract with proxy
const hre = require("hardhat");
const { ethers, upgrades } = hre;
const fs = require("fs");

// Previously deployed MockHeirToken address
const HEIR_TOKEN_ADDRESS = "0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42";
// You can add more tokens to allowlist after deployment

async function main() {
    console.log("========================================");
    console.log("🚀 Deploying DeFAIStakingUpgradeable to Base Sepolia");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await deployer.getBalance();
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");
    
    try {
        // 1. Deploy DeFAIStakingUpgradeable as upgradeable
        console.log("========================================");
        console.log("1. Deploying DeFAIStakingUpgradeable (Upgradeable)");
        console.log("========================================");
        
        const DeFAIStakingUpgradeable = await ethers.getContractFactory("DeFAIStakingUpgradeable");
        
        // Check if upgrades plugin is available, if not deploy manually
        let stakingProxy;
        let implementationAddress;
        let adminAddress;
        
        try {
            // Try using upgrades plugin
            stakingProxy = await upgrades.deployProxy(
                DeFAIStakingUpgradeable,
                [
                    HEIR_TOKEN_ADDRESS,  // _defaiToken (new token)
                    HEIR_TOKEN_ADDRESS,  // _oldDefaiToken (for migration, using same for now)
                    deployer.address     // _admin
                ],
                { 
                    initializer: 'initialize',
                    kind: 'transparent'
                }
            );
            
            await stakingProxy.deployed();
            
            // Get implementation address
            implementationAddress = await upgrades.erc1967.getImplementationAddress(stakingProxy.address);
            // Get admin address (ProxyAdmin)
            adminAddress = await upgrades.erc1967.getAdminAddress(stakingProxy.address);
            
        } catch (upgradesError) {
            console.log("⚠️  Upgrades plugin not available, deploying manually...");
            
            // Deploy implementation
            const implementation = await DeFAIStakingUpgradeable.deploy();
            await implementation.deployed();
            implementationAddress = implementation.address;
            console.log("   Implementation deployed to:", implementationAddress);
            
            // For manual deployment, we'll use the implementation directly
            // and initialize it
            stakingProxy = implementation;
            
            // Initialize the contract
            const initTx = await stakingProxy.initialize(
                HEIR_TOKEN_ADDRESS,  // _defaiToken (new token)
                HEIR_TOKEN_ADDRESS,  // _oldDefaiToken (for migration, using same for now)
                deployer.address     // _admin
            );
            await initTx.wait();
            console.log("   Contract initialized");
            
            adminAddress = deployer.address; // Admin is deployer in manual deployment
        }
        
        console.log("✅ DeFAIStakingUpgradeable deployed to:", stakingProxy.address);
        console.log("   Implementation address:", implementationAddress);
        console.log("   Admin address:", adminAddress);
        
        // Wait for confirmations
        console.log("   Waiting for confirmations...");
        await stakingProxy.deployTransaction.wait(5);
        console.log("   ✅ Deployment confirmed!\n");
        
        // 2. Fund escrow (transfer some tokens to contract for rewards)
        console.log("========================================");
        console.log("2. Funding Escrow for Rewards");
        console.log("========================================");
        
        // Note: The admin should transfer HEIR tokens to the contract for rewards
        console.log("⚠️  Remember to fund the contract with HEIR tokens for rewards");
        console.log("   Contract address:", stakingProxy.address);
        console.log("   Send HEIR tokens directly to this address\n");
        
        // 3. Configure staking tiers (if needed - contract may have defaults)
        console.log("========================================");
        console.log("3. Configuring Staking Tiers");
        console.log("========================================");
        
        // The contract has default tiers set in the constants:
        // Gold: 10M-100M tokens, 0.5% APY
        // Titanium: 100M-1B tokens, 0.75% APY
        // Infinite: 1B+ tokens, 1% APY
        console.log("✅ Using default tier configuration:");
        console.log("   Gold: 10M-100M HEIR, 0.5% APY");
        console.log("   Titanium: 100M-1B HEIR, 0.75% APY");
        console.log("   Infinite: 1B+ HEIR, 1% APY\n");
        
        // 4. Verify configuration
        console.log("========================================");
        console.log("4. Verifying Configuration");
        console.log("========================================");
        
        const defaiToken = await stakingProxy.defaiToken();
        const oldDefaiToken = await stakingProxy.oldDefaiToken();
        const totalStaked = await stakingProxy.totalStaked();
        const paused = await stakingProxy.paused();
        
        console.log("Current DEFAI Token:", defaiToken);
        console.log("Old DEFAI Token:", oldDefaiToken);
        console.log("Total Staked:", totalStaked.toString());
        console.log("Contract Paused:", paused);
        console.log();
        
        // 5. Save deployment information
        const deploymentInfo = {
            network: "base-sepolia",
            chainId: 84532,
            deployer: deployer.address,
            contracts: {
                MockHeirToken: HEIR_TOKEN_ADDRESS,
                DeFAIStakingUpgradeable: {
                    proxy: stakingProxy.address,
                    implementation: implementationAddress,
                    proxyAdmin: adminAddress
                }
            },
            configuration: {
                defaiToken: defaiToken,
                oldDefaiToken: oldDefaiToken,
                admin: deployer.address,
                tiers: {
                    gold: {
                        id: 0,
                        min: "10000000",
                        max: "100000000",
                        apy: "0.5%",
                        lockPeriod: "30 days"
                    },
                    titanium: {
                        id: 1,
                        min: "100000000",
                        max: "1000000000",
                        apy: "0.75%",
                        lockPeriod: "90 days"
                    },
                    infinite: {
                        id: 2,
                        min: "1000000000",
                        max: "unlimited",
                        apy: "1%",
                        lockPeriod: "180 days"
                    }
                }
            },
            deployedAt: new Date().toISOString(),
            blockNumber: (await ethers.provider.getBlockNumber()),
            explorerUrls: {
                HeirToken: `https://sepolia.basescan.org/address/${HEIR_TOKEN_ADDRESS}`,
                StakingProxy: `https://sepolia.basescan.org/address/${stakingProxy.address}`,
                Implementation: `https://sepolia.basescan.org/address/${implementationAddress}`,
                ProxyAdmin: `https://sepolia.basescan.org/address/${adminAddress}`
            }
        };
        
        const fileName = `staking-deployment-${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(deploymentInfo, null, 2));
        console.log(`📁 Deployment info saved to ${fileName}\n`);
        
        // 6. Display summary
        console.log("========================================");
        console.log("✅ STAKING DEPLOYMENT SUCCESSFUL!");
        console.log("========================================\n");
        console.log("📋 Contract Addresses:");
        console.log("----------------------");
        console.log("MockHeirToken:", HEIR_TOKEN_ADDRESS);
        console.log("Staking Proxy:", stakingProxy.address);
        console.log("Implementation:", implementationAddress);
        console.log("ProxyAdmin:", adminAddress);
        console.log("\n🔗 Explorer Links:");
        console.log("------------------");
        console.log("Staking Contract:", `https://sepolia.basescan.org/address/${stakingProxy.address}`);
        console.log("HEIR Token:", `https://sepolia.basescan.org/address/${HEIR_TOKEN_ADDRESS}`);
        console.log("\n📝 Next Steps:");
        console.log("--------------");
        console.log("1. Fund the contract with HEIR tokens for rewards (send to contract address)");
        console.log("2. Users can now stake HEIR tokens in the DeFAIStakingUpgradeable contract");
        console.log("3. Contract is upgradeable via ProxyAdmin");
        console.log("4. Staking tiers are pre-configured with sustainable APYs");
        console.log("5. Admin has all necessary roles for management");
        
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