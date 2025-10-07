// Deployment script for Base Sepolia testnet
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("========================================");
    console.log("Deploying to Base Sepolia Testnet");
    console.log("========================================\n");

    // Check if we have a private key
    if (!process.env.PRIVATE_KEY) {
        console.error("ERROR: Please set PRIVATE_KEY in your .env file");
        console.log("\nTo deploy, you need to:");
        console.log("1. Create a .env file based on .env.example");
        console.log("2. Add your private key (without 0x prefix)");
        console.log("3. Ensure your wallet has Base Sepolia ETH");
        console.log("\nGet Base Sepolia ETH from: https://www.alchemy.com/faucets/base-sepolia");
        process.exit(1);
    }

    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Check balance
    const balance = await deployer.getBalance();
    console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");
    
    if (balance.eq(0)) {
        console.error("\nERROR: Insufficient balance!");
        console.log("Get Base Sepolia ETH from: https://www.alchemy.com/faucets/base-sepolia");
        process.exit(1);
    }

    // Get configuration
    const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
    const platformFeeBps = process.env.PLATFORM_FEE_BPS || 2000;

    console.log("\nDeployment Configuration:");
    console.log("- Treasury:", treasuryAddress);
    console.log("- Platform Fee:", platformFeeBps / 100 + "%");
    console.log("- Network: Base Sepolia (Chain ID: 84532)");
    console.log("\n========================================\n");

    try {
        // Deploy MockDefaiToken
        console.log("1. Deploying MockDefaiToken...");
        const MockDefaiToken = await hre.ethers.getContractFactory("MockDefaiToken");
        const defaiToken = await MockDefaiToken.deploy();
        await defaiToken.deployed();
        console.log("✅ MockDefaiToken deployed to:", defaiToken.address);
        console.log("   Transaction hash:", defaiToken.deployTransaction.hash);

        // Wait for confirmation
        console.log("   Waiting for confirmation...");
        await defaiToken.deployTransaction.wait(3);
        console.log("   Confirmed!\n");

        // Deploy DefaiAppFactory
        console.log("2. Deploying DefaiAppFactory...");
        const DefaiAppFactory = await hre.ethers.getContractFactory("DefaiAppFactory");
        const appFactory = await DefaiAppFactory.deploy(
            defaiToken.address,
            treasuryAddress,
            platformFeeBps
        );
        await appFactory.deployed();
        console.log("✅ DefaiAppFactory deployed to:", appFactory.address);
        console.log("   Transaction hash:", appFactory.deployTransaction.hash);

        // Wait for confirmation
        console.log("   Waiting for confirmation...");
        await appFactory.deployTransaction.wait(3);
        console.log("   Confirmed!\n");

        // Get some test tokens from faucet
        console.log("3. Getting test DEFAI tokens from faucet...");
        const faucetTx = await defaiToken.faucet();
        await faucetTx.wait();
        const tokenBalance = await defaiToken.balanceOf(deployer.address);
        console.log("✅ Received", ethers.utils.formatUnits(tokenBalance, 6), "DEFAI tokens\n");

        // Save deployment info
        const deploymentInfo = {
            network: "base-sepolia",
            chainId: 84532,
            deployer: deployer.address,
            contracts: {
                MockDefaiToken: defaiToken.address,
                DefaiAppFactory: appFactory.address
            },
            treasury: treasuryAddress,
            platformFeeBps: platformFeeBps,
            deployedAt: new Date().toISOString(),
            blockNumber: await ethers.provider.getBlockNumber(),
            explorerUrls: {
                MockDefaiToken: `https://sepolia.basescan.org/address/${defaiToken.address}`,
                DefaiAppFactory: `https://sepolia.basescan.org/address/${appFactory.address}`
            }
        };

        const fileName = `deployment-base-sepolia-${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(deploymentInfo, null, 2));
        console.log(`📁 Deployment info saved to ${fileName}\n`);

        console.log("========================================");
        console.log("🎉 DEPLOYMENT SUCCESSFUL!");
        console.log("========================================\n");
        console.log("Contract Addresses:");
        console.log("- MockDefaiToken:", defaiToken.address);
        console.log("- DefaiAppFactory:", appFactory.address);
        console.log("\nView on Base Sepolia Explorer:");
        console.log("- Token:", deploymentInfo.explorerUrls.MockDefaiToken);
        console.log("- Factory:", deploymentInfo.explorerUrls.DefaiAppFactory);
        console.log("\n========================================");

        // Optional: Verify contracts if API key is provided
        if (process.env.BASESCAN_API_KEY) {
            console.log("\n4. Verifying contracts on Basescan...");
            console.log("   (This may take a few minutes)");
            
            try {
                // Wait a bit for Basescan to index
                console.log("   Waiting 30s for Basescan to index...");
                await new Promise(resolve => setTimeout(resolve, 30000));

                console.log("   Verifying MockDefaiToken...");
                await hre.run("verify:verify", {
                    address: defaiToken.address,
                    constructorArguments: [],
                    network: "baseSepolia"
                });
                console.log("   ✅ MockDefaiToken verified!");

                console.log("   Verifying DefaiAppFactory...");
                await hre.run("verify:verify", {
                    address: appFactory.address,
                    constructorArguments: [
                        defaiToken.address,
                        treasuryAddress,
                        platformFeeBps
                    ],
                    network: "baseSepolia"
                });
                console.log("   ✅ DefaiAppFactory verified!");
            } catch (error) {
                console.log("   ⚠️  Verification failed:", error.message);
                console.log("   You can verify manually later using:");
                console.log(`   npx hardhat verify --network baseSepolia ${defaiToken.address}`);
                console.log(`   npx hardhat verify --network baseSepolia ${appFactory.address} ${defaiToken.address} ${treasuryAddress} ${platformFeeBps}`);
            }
        }

        // Test the deployment
        console.log("\n5. Testing deployment...");
        
        // Test registering an app
        console.log("   Testing app registration...");
        const registerTx = await appFactory.registerApp(
            ethers.utils.parseUnits("10", 6), // 10 DEFAI
            100, // max supply
            "ipfs://QmTest123"
        );
        await registerTx.wait();
        console.log("   ✅ App registered successfully!");
        
        const totalApps = await appFactory.totalApps();
        console.log("   Total apps registered:", totalApps.toString());

        console.log("\n========================================");
        console.log("✅ All tests passed! Deployment complete.");
        console.log("========================================\n");

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