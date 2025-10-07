const { ethers } = require("hardhat");

async function main() {
  console.log("=".repeat(60));
  console.log("SIMULATING BASE SEPOLIA DEPLOYMENT");
  console.log("=".repeat(60));
  
  console.log("\n📋 Deployment Simulation for Base Sepolia");
  console.log("Network: Base Sepolia");
  console.log("Chain ID: 84532");
  console.log("RPC URL: https://sepolia.base.org");
  
  // Get contract factories to estimate deployment
  console.log("\n📊 Estimating deployment costs...\n");
  
  const [deployer] = await ethers.getSigners();
  console.log("Simulated Deployer:", deployer.address);
  
  // Compile and get deployment bytecode sizes
  const MockToken = await ethers.getContractFactory("MockDEFAIToken");
  const DeFAIStaking = await ethers.getContractFactory("DeFAIStaking");
  
  // Deploy on local hardhat network for simulation
  console.log("1. Deploying Mock DEFAI Token (simulation)...");
  const mockToken = await MockToken.deploy();
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log("   ✅ Token deployed to:", tokenAddress);
  
  console.log("\n2. Deploying Staking Contract (simulation)...");
  const staking = await DeFAIStaking.deploy(tokenAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("   ✅ Staking deployed to:", stakingAddress);
  
  // Get deployment transaction details for gas estimation
  const tokenDeployTx = mockToken.deploymentTransaction();
  const stakingDeployTx = staking.deploymentTransaction();
  
  console.log("\n📈 Gas Estimates:");
  console.log("   Token Deployment Gas:", tokenDeployTx.gasLimit.toString());
  console.log("   Staking Deployment Gas:", stakingDeployTx.gasLimit.toString());
  
  // Estimate costs at different gas prices
  const gasPrices = [1, 2, 5]; // in gwei
  const totalGas = tokenDeployTx.gasLimit + stakingDeployTx.gasLimit;
  
  console.log("\n💰 Estimated Deployment Costs:");
  for (const gwei of gasPrices) {
    const costInEth = ethers.formatEther(totalGas * BigInt(gwei) * BigInt(1e9));
    console.log(`   At ${gwei} gwei: ${costInEth} ETH`);
  }
  
  // Test basic functionality
  console.log("\n🧪 Testing Contract Functionality...\n");
  
  // Fund escrow
  const escrowAmount = ethers.parseUnits("100000000", 6);
  await mockToken.approve(stakingAddress, escrowAmount);
  await staking.fundEscrow(escrowAmount);
  console.log("   ✅ Escrow funded with 100M DEFAI");
  
  // Get some test tokens
  await mockToken.faucet();
  const balance = await mockToken.balanceOf(deployer.address);
  console.log("   ✅ Faucet dispensed:", ethers.formatUnits(balance, 6), "DEFAI");
  
  // Test staking
  const stakeAmount = ethers.parseUnits("50000000", 6); // 50M for Gold tier
  await mockToken.approve(stakingAddress, stakeAmount);
  await staking.stakeTokens(stakeAmount);
  console.log("   ✅ Staked 50M DEFAI (Gold Tier)");
  
  // Check user stake
  const userInfo = await staking.getUserStakeInfo(deployer.address);
  console.log("   ✅ User tier:", ["None", "Gold", "Titanium", "Infinite"][userInfo.tier]);
  
  // Generate deployment commands
  console.log("\n" + "=".repeat(60));
  console.log("📝 DEPLOYMENT INSTRUCTIONS FOR BASE SEPOLIA");
  console.log("=".repeat(60));
  
  console.log("\n1. Fund your wallet (minimum 0.01 ETH):");
  console.log("   Wallet: 0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C");
  console.log("\n2. Get Base Sepolia ETH from faucets:");
  console.log("   - Alchemy: https://www.alchemy.com/faucets/base-sepolia");
  console.log("   - QuickNode: https://faucet.quicknode.com/base/sepolia");
  console.log("\n3. Run deployment command:");
  console.log("   npx hardhat run scripts/deploy-base-sepolia.js --network baseSepolia");
  console.log("\n4. Verify contracts (optional):");
  console.log("   npx hardhat verify --network baseSepolia <TOKEN_ADDRESS>");
  console.log("   npx hardhat verify --network baseSepolia <STAKING_ADDRESS> <TOKEN_ADDRESS>");
  
  // Create example interaction scripts
  const fs = require("fs");
  const interactionScript = `
// Example: Interact with deployed contracts on Base Sepolia

const { ethers } = require("hardhat");

async function interact() {
  // Replace with your deployed addresses
  const TOKEN_ADDRESS = "YOUR_TOKEN_ADDRESS";
  const STAKING_ADDRESS = "YOUR_STAKING_ADDRESS";
  
  const [signer] = await ethers.getSigners();
  
  // Get contract instances
  const token = await ethers.getContractAt("MockDEFAIToken", TOKEN_ADDRESS);
  const staking = await ethers.getContractAt("DeFAIStaking", STAKING_ADDRESS);
  
  // Get test tokens from faucet
  await token.faucet();
  console.log("Got tokens from faucet");
  
  // Stake tokens
  const stakeAmount = ethers.parseUnits("10000000", 6); // 10M DEFAI
  await token.approve(STAKING_ADDRESS, stakeAmount);
  await staking.stakeTokens(stakeAmount);
  console.log("Staked tokens successfully");
  
  // Check stake info
  const info = await staking.getUserStakeInfo(signer.address);
  console.log("Stake info:", info);
}

interact().catch(console.error);
`;

  fs.writeFileSync("./scripts/interact-base-sepolia.js", interactionScript);
  console.log("\n✅ Created interaction script: scripts/interact-base-sepolia.js");
  
  // Show wallet info
  console.log("\n" + "=".repeat(60));
  console.log("💳 WALLET INFORMATION");
  console.log("=".repeat(60));
  console.log("\nYour deployment wallet:");
  console.log("Address: 0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C");
  console.log("\n⚠️  IMPORTANT: Keep your private key secure!");
  console.log("The private key is stored in .env file");
  
  return {
    tokenAddress,
    stakingAddress,
    estimatedCost: ethers.formatEther(totalGas * BigInt(2e9)) + " ETH"
  };
}

main()
  .then((result) => {
    console.log("\n" + "=".repeat(60));
    console.log("✅ SIMULATION COMPLETE");
    console.log("=".repeat(60));
    console.log("\nEstimated deployment cost: ~" + result.estimatedCost);
    console.log("\n🚀 Ready to deploy to Base Sepolia!");
    console.log("   Run: npx hardhat run scripts/deploy-base-sepolia.js --network baseSepolia");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });