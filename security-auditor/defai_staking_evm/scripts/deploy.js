const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Starting DeFAI Staking deployment...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Get DEFAI token address from environment or deploy mock
  let defaiTokenAddress = process.env.DEFAI_TOKEN_ADDRESS;
  
  if (!defaiTokenAddress || defaiTokenAddress === "0x0000000000000000000000000000000000000000") {
    console.log("\nDeploying Mock DEFAI Token for testing...");
    const MockToken = await ethers.getContractFactory("MockDEFAIToken");
    const mockToken = await MockToken.deploy();
    await mockToken.waitForDeployment();
    defaiTokenAddress = await mockToken.getAddress();
    console.log("Mock DEFAI Token deployed to:", defaiTokenAddress);
  } else {
    console.log("Using existing DEFAI Token at:", defaiTokenAddress);
  }

  // Deploy DeFAI Staking contract
  console.log("\nDeploying DeFAI Staking contract...");
  const DeFAIStaking = await ethers.getContractFactory("DeFAIStaking");
  const staking = await DeFAIStaking.deploy(defaiTokenAddress);
  await staking.waitForDeployment();
  
  const stakingAddress = await staking.getAddress();
  console.log("DeFAI Staking deployed to:", stakingAddress);

  // Verify deployment
  console.log("\nVerifying deployment...");
  const defaiToken = await staking.defaiToken();
  console.log("DEFAI Token address in staking contract:", defaiToken);
  console.log("Total staked:", await staking.totalStaked());
  console.log("Total users:", await staking.totalUsers());
  console.log("Owner:", await staking.owner());

  // Save deployment addresses
  const fs = require("fs");
  const deploymentInfo = {
    network: network.name,
    timestamp: new Date().toISOString(),
    contracts: {
      DeFAIStaking: stakingAddress,
      DEFAIToken: defaiTokenAddress,
    },
    deployer: deployer.address
  };

  const deploymentPath = `./deployments/${network.name}_deployment.json`;
  if (!fs.existsSync("./deployments")) {
    fs.mkdirSync("./deployments");
  }
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to ${deploymentPath}`);

  // Instructions for verification
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETED SUCCESSFULLY!");
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("1. Fund the escrow by calling fundEscrow() with DEFAI tokens");
  console.log("2. Verify contract on block explorer:");
  console.log(`   npx hardhat verify --network ${network.name} ${stakingAddress} ${defaiTokenAddress}`);
  console.log("\nImportant addresses:");
  console.log(`Staking Contract: ${stakingAddress}`);
  console.log(`DEFAI Token: ${defaiTokenAddress}`);
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });