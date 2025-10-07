const hre = require("hardhat");

async function main() {
    console.log("Starting DefAI Estate deployment...");

    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Deploy DefAIEstate main contract
    console.log("\n1. Deploying DefAIEstate...");
    const DefAIEstate = await hre.ethers.getContractFactory("DefAIEstate");
    const defaiEstate = await DefAIEstate.deploy();
    await defaiEstate.deployed();
    console.log("DefAIEstate deployed to:", defaiEstate.address);

    // Deploy TokenVault
    console.log("\n2. Deploying TokenVault...");
    const TokenVault = await hre.ethers.getContractFactory("TokenVault");
    const tokenVault = await TokenVault.deploy(defaiEstate.address);
    await tokenVault.deployed();
    console.log("TokenVault deployed to:", tokenVault.address);

    // Deploy EmergencyManager
    console.log("\n3. Deploying EmergencyManager...");
    const EmergencyManager = await hre.ethers.getContractFactory("EmergencyManager");
    const emergencyManager = await EmergencyManager.deploy(defaiEstate.address);
    await emergencyManager.deployed();
    console.log("EmergencyManager deployed to:", emergencyManager.address);

    // Save deployment addresses
    const deploymentInfo = {
        network: hre.network.name,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            DefAIEstate: defaiEstate.address,
            TokenVault: tokenVault.address,
            EmergencyManager: emergencyManager.address
        }
    };

    const fs = require('fs');
    const path = require('path');
    const deploymentsPath = path.join(__dirname, '../deployments');
    
    if (!fs.existsSync(deploymentsPath)) {
        fs.mkdirSync(deploymentsPath);
    }

    const deploymentFile = path.join(deploymentsPath, `${hre.network.name}-deployment.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

    console.log("\n✅ Deployment complete!");
    console.log("Deployment info saved to:", deploymentFile);

    // Verify contracts on Etherscan (if not on localhost)
    if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
        console.log("\n4. Verifying contracts on Etherscan...");
        
        try {
            await hre.run("verify:verify", {
                address: defaiEstate.address,
                constructorArguments: []
            });
            console.log("DefAIEstate verified");
        } catch (error) {
            console.log("DefAIEstate verification failed:", error.message);
        }

        try {
            await hre.run("verify:verify", {
                address: tokenVault.address,
                constructorArguments: [defaiEstate.address]
            });
            console.log("TokenVault verified");
        } catch (error) {
            console.log("TokenVault verification failed:", error.message);
        }

        try {
            await hre.run("verify:verify", {
                address: emergencyManager.address,
                constructorArguments: [defaiEstate.address]
            });
            console.log("EmergencyManager verified");
        } catch (error) {
            console.log("EmergencyManager verification failed:", error.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });