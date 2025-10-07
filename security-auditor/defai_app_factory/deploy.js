// Deployment script for DefaiAppFactory
const hre = require("hardhat");

async function main() {
    console.log("Deploying DefaiAppFactory...");

    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Deploy MockDefaiToken (for testing - replace with actual token address in production)
    const MockDefaiToken = await hre.ethers.getContractFactory("MockDefaiToken");
    const defaiToken = await MockDefaiToken.deploy();
    await defaiToken.deployed();
    console.log("MockDefaiToken deployed to:", defaiToken.address);

    // Set up treasury address (can be a multisig in production)
    const treasuryAddress = deployer.address; // Change this in production
    
    // Set platform fee to 20% (2000 basis points)
    const platformFeeBps = 2000;

    // Deploy DefaiAppFactory
    const DefaiAppFactory = await hre.ethers.getContractFactory("DefaiAppFactory");
    const appFactory = await DefaiAppFactory.deploy(
        defaiToken.address,
        treasuryAddress,
        platformFeeBps
    );
    await appFactory.deployed();
    console.log("DefaiAppFactory deployed to:", appFactory.address);

    // Verify contracts on Etherscan (if not on localhost)
    if (network.name !== "hardhat" && network.name !== "localhost") {
        console.log("Waiting for block confirmations...");
        await defaiToken.deployTransaction.wait(6); // Wait for 6 block confirmations
        await appFactory.deployTransaction.wait(6);
        
        console.log("Verifying MockDefaiToken...");
        try {
            await hre.run("verify:verify", {
                address: defaiToken.address,
                constructorArguments: [],
            });
        } catch (error) {
            console.log("MockDefaiToken verification failed:", error);
        }

        console.log("Verifying DefaiAppFactory...");
        try {
            await hre.run("verify:verify", {
                address: appFactory.address,
                constructorArguments: [
                    defaiToken.address,
                    treasuryAddress,
                    platformFeeBps
                ],
            });
        } catch (error) {
            console.log("DefaiAppFactory verification failed:", error);
        }
    }

    console.log("\n=== Deployment Summary ===");
    console.log("Network:", network.name);
    console.log("MockDefaiToken:", defaiToken.address);
    console.log("DefaiAppFactory:", appFactory.address);
    console.log("Treasury:", treasuryAddress);
    console.log("Platform Fee:", platformFeeBps / 100 + "%");
    console.log("========================\n");

    // Save deployment addresses to file
    const fs = require("fs");
    const deploymentInfo = {
        network: network.name,
        contracts: {
            MockDefaiToken: defaiToken.address,
            DefaiAppFactory: appFactory.address
        },
        treasury: treasuryAddress,
        platformFeeBps: platformFeeBps,
        deployedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(
        `deployment-${network.name}.json`,
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log(`Deployment info saved to deployment-${network.name}.json`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });