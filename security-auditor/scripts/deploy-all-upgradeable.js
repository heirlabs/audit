const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("========================================");
    console.log("🚀 UNIFIED UPGRADEABLE DEPLOYMENT TO BASE SEPOLIA");
    console.log("========================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

    const deploymentInfo = {
        network: "Base Sepolia",
        chainId: 84532,
        deployer: deployer.address,
        timestamp: Date.now(),
        contracts: {}
    };

    try {
        // ========================================
        // STEP 1: Deploy Shared Token Contracts
        // ========================================
        console.log("📦 STEP 1: Deploying Shared Token Contracts");
        console.log("----------------------------------------");

        // Deploy OLD DEFAI Token (Mock for testing)
        console.log("\n1.1 Deploying OLD DEFAI Token...");
        const OldDefaiToken = await ethers.getContractFactory("MockERC20");
        const oldDefaiToken = await OldDefaiToken.deploy("Old DEFAI Token", "OLDDEFAI", 6);
        await oldDefaiToken.waitForDeployment();
        const oldDefaiAddress = await oldDefaiToken.getAddress();
        console.log("✅ OLD DEFAI Token deployed to:", oldDefaiAddress);
        deploymentInfo.contracts.oldDefaiToken = oldDefaiAddress;

        // Deploy DEFAI Token (Mock for testing)
        console.log("\n1.2 Deploying DEFAI Token...");
        const DefaiToken = await ethers.getContractFactory("MockERC20");
        const defaiToken = await DefaiToken.deploy("DEFAI Token", "DEFAI", 6);
        await defaiToken.waitForDeployment();
        const defaiAddress = await defaiToken.getAddress();
        console.log("✅ DEFAI Token deployed to:", defaiAddress);
        deploymentInfo.contracts.defaiToken = defaiAddress;

        // Mint tokens to deployer for testing
        console.log("\n1.3 Minting test tokens...");
        await oldDefaiToken.mint(deployer.address, ethers.parseUnits("1000000", 6));
        await defaiToken.mint(deployer.address, ethers.parseUnits("1000000", 6));
        console.log("✅ Minted 1,000,000 of each token to deployer");

        // ========================================
        // STEP 2: Deploy DefAI Staking (Upgradeable)
        // ========================================
        console.log("\n📦 STEP 2: Deploying DefAI Staking (Upgradeable)");
        console.log("----------------------------------------");

        const DeFAIStakingUpgradeable = await ethers.getContractFactory("DeFAIStakingUpgradeable");
        const stakingProxy = await upgrades.deployProxy(
            DeFAIStakingUpgradeable,
            [defaiAddress, oldDefaiAddress, deployer.address],
            { initializer: 'initialize', kind: 'uups' }
        );
        await stakingProxy.waitForDeployment();
        const stakingAddress = await stakingProxy.getAddress();
        console.log("✅ DefAI Staking deployed to:", stakingAddress);
        deploymentInfo.contracts.defaiStaking = {
            proxy: stakingAddress,
            implementation: await upgrades.erc1967.getImplementationAddress(stakingAddress)
        };

        // Fund the staking contract's escrow
        console.log("\n2.1 Funding staking escrow...");
        await defaiToken.approve(stakingAddress, ethers.parseUnits("100000", 6));
        await stakingProxy.fundEscrow(ethers.parseUnits("100000", 6));
        console.log("✅ Funded escrow with 100,000 DEFAI");

        // ========================================
        // STEP 3: Deploy DefAI App Factory (Upgradeable)
        // ========================================
        console.log("\n📦 STEP 3: Deploying DefAI App Factory (Upgradeable)");
        console.log("----------------------------------------");

        const DefaiAppFactoryUpgradeable = await ethers.getContractFactory("DefaiAppFactoryUpgradeable");
        const factoryProxy = await upgrades.deployProxy(
            DefaiAppFactoryUpgradeable,
            [defaiAddress, deployer.address, 2000], // 20% platform fee
            { initializer: 'initialize', kind: 'uups' }
        );
        await factoryProxy.waitForDeployment();
        const factoryAddress = await factoryProxy.getAddress();
        console.log("✅ DefAI App Factory deployed to:", factoryAddress);
        deploymentInfo.contracts.defaiAppFactory = {
            proxy: factoryAddress,
            implementation: await upgrades.erc1967.getImplementationAddress(factoryAddress)
        };

        // ========================================
        // STEP 4: Deploy DefAI Swap (Upgradeable)
        // ========================================
        console.log("\n📦 STEP 4: Deploying DefAI Swap (Upgradeable)");
        console.log("----------------------------------------");

        // First deploy the NFT contract
        console.log("\n4.1 Deploying DefAI NFT...");
        const DefaiNFT = await ethers.getContractFactory("DefaiNFT");
        const defaiNFT = await DefaiNFT.deploy();
        await defaiNFT.waitForDeployment();
        const nftAddress = await defaiNFT.getAddress();
        console.log("✅ DefAI NFT deployed to:", nftAddress);
        deploymentInfo.contracts.defaiNFT = nftAddress;

        console.log("\n4.2 Deploying DefAI Swap...");
        const DefaiSwapUpgradeable = await ethers.getContractFactory("DefaiSwapUpgradeable");
        const swapProxy = await upgrades.deployProxy(
            DefaiSwapUpgradeable,
            [
                oldDefaiAddress,
                defaiAddress,
                nftAddress,
                deployer.address, // treasury
                "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634", // VRF Coordinator Base Sepolia
                deployer.address // admin
            ],
            { initializer: 'initialize', kind: 'uups' }
        );
        await swapProxy.waitForDeployment();
        const swapAddress = await swapProxy.getAddress();
        console.log("✅ DefAI Swap deployed to:", swapAddress);
        deploymentInfo.contracts.defaiSwap = {
            proxy: swapAddress,
            implementation: await upgrades.erc1967.getImplementationAddress(swapAddress)
        };

        // Grant minter role to swap contract
        console.log("\n4.3 Configuring NFT minter role...");
        await defaiNFT.grantRole(await defaiNFT.MINTER_ROLE(), swapAddress);
        console.log("✅ Granted MINTER_ROLE to swap contract");

        // ========================================
        // STEP 5: Deploy DefAI Estate (Upgradeable)
        // ========================================
        console.log("\n📦 STEP 5: Deploying DefAI Estate (Upgradeable)");
        console.log("----------------------------------------");

        const DefaiEstateUpgradeable = await ethers.getContractFactory("DefaiEstateUpgradeable");
        const estateProxy = await upgrades.deployProxy(
            DefaiEstateUpgradeable,
            [defaiAddress, deployer.address],
            { initializer: 'initialize', kind: 'uups' }
        );
        await estateProxy.waitForDeployment();
        const estateAddress = await estateProxy.getAddress();
        console.log("✅ DefAI Estate deployed to:", estateAddress);
        deploymentInfo.contracts.defaiEstate = {
            proxy: estateAddress,
            implementation: await upgrades.erc1967.getImplementationAddress(estateAddress)
        };

        // ========================================
        // STEP 6: Verify All Contracts Use Same Tokens
        // ========================================
        console.log("\n📦 STEP 6: Verifying Token Configuration");
        console.log("----------------------------------------");

        const stakingToken = await stakingProxy.defaiToken();
        const factoryToken = await factoryProxy.defaiToken();
        const swapNewToken = await swapProxy.newDefaiToken();
        const swapOldToken = await swapProxy.oldDefaiToken();

        console.log("\nToken Configuration:");
        console.log("- Staking DEFAI Token:", stakingToken);
        console.log("- Factory DEFAI Token:", factoryToken);
        console.log("- Swap NEW DEFAI Token:", swapNewToken);
        console.log("- Swap OLD DEFAI Token:", swapOldToken);
        console.log("- Estate DEFAI Token:", await estateProxy.defaiToken());

        if (stakingToken === defaiAddress && 
            factoryToken === defaiAddress && 
            swapNewToken === defaiAddress &&
            swapOldToken === oldDefaiAddress) {
            console.log("\n✅ All contracts configured with correct shared tokens!");
        } else {
            console.log("\n⚠️ Token configuration mismatch detected!");
        }

        // ========================================
        // Save Deployment Info
        // ========================================
        const deploymentPath = path.join(
            __dirname,
            `deployment-unified-upgradeable-${Date.now()}.json`
        );
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log(`\n📁 Deployment info saved to ${deploymentPath}`);

        // ========================================
        // Summary
        // ========================================
        console.log("\n========================================");
        console.log("🎉 DEPLOYMENT COMPLETE!");
        console.log("========================================\n");
        console.log("Shared Tokens:");
        console.log("├─ OLD DEFAI:", oldDefaiAddress);
        console.log("└─ DEFAI:", defaiAddress);
        console.log("\nUpgradeable Contracts:");
        console.log("├─ Staking Proxy:", stakingAddress);
        console.log("├─ App Factory Proxy:", factoryAddress);
        console.log("├─ Swap Proxy:", swapAddress);
        console.log("├─ Estate Proxy:", estateAddress);
        console.log("└─ NFT Contract:", nftAddress);
        console.log("\n🔍 View on Base Sepolia Explorer:");
        console.log(`https://sepolia.basescan.org/address/${defaiAddress}`);
        console.log("\n⚠️ Important: All contracts are upgradeable!");
        console.log("Use the proxy addresses for all interactions.");
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