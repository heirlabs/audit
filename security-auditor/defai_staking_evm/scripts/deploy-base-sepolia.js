const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("=".repeat(60));
  console.log("DEPLOYING TO BASE SEPOLIA TESTNET");
  console.log("=".repeat(60));
  
  // Check if we have a private key
  if (!process.env.PRIVATE_KEY) {
    console.error("❌ No PRIVATE_KEY found in .env file!");
    console.log("Run: node scripts/create-wallet.js");
    process.exit(1);
  }

  // Connect to Base Sepolia
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log("Deployer Address:", wallet.address);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  const balanceInEth = ethers.formatEther(balance);
  console.log("Deployer Balance:", balanceInEth, "ETH");
  
  if (parseFloat(balanceInEth) < 0.005) {
    console.error("\n❌ Insufficient balance for deployment!");
    console.log("Minimum required: 0.005 ETH");
    console.log("\n📋 Fund your wallet at:");
    console.log("Address:", wallet.address);
    console.log("\nFaucets:");
    console.log("- https://www.alchemy.com/faucets/base-sepolia");
    console.log("- https://faucet.quicknode.com/base/sepolia");
    process.exit(1);
  }

  console.log("\n📦 Starting deployment...\n");

  try {
    // Deploy Mock DEFAI Token
    console.log("1. Deploying Mock DEFAI Token...");
    const MockToken = await ethers.getContractFactory("MockDEFAIToken", wallet);
    const mockToken = await MockToken.deploy();
    await mockToken.waitForDeployment();
    const tokenAddress = await mockToken.getAddress();
    console.log("   ✅ DEFAI Token deployed to:", tokenAddress);

    // Deploy Staking Contract
    console.log("\n2. Deploying DeFAI Staking Contract...");
    const DeFAIStaking = await ethers.getContractFactory("DeFAIStaking", wallet);
    const staking = await DeFAIStaking.deploy(tokenAddress);
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();
    console.log("   ✅ Staking Contract deployed to:", stakingAddress);

    // Fund the escrow
    console.log("\n3. Setting up initial escrow...");
    const escrowAmount = ethers.parseUnits("100000000", 6); // 100M DEFAI for rewards
    await mockToken.approve(stakingAddress, escrowAmount);
    console.log("   ✅ Approved escrow funding");
    
    await staking.fundEscrow(escrowAmount);
    console.log("   ✅ Funded escrow with 100M DEFAI");

    // Verify deployment
    console.log("\n4. Verifying deployment...");
    const totalStaked = await staking.totalStaked();
    const escrowBalance = await staking.escrowBalance();
    const owner = await staking.owner();
    
    console.log("   Total Staked:", ethers.formatUnits(totalStaked, 6), "DEFAI");
    console.log("   Escrow Balance:", ethers.formatUnits(escrowBalance, 6), "DEFAI");
    console.log("   Contract Owner:", owner);

    // Save deployment info
    const fs = require("fs");
    const deploymentInfo = {
      network: "base-sepolia",
      chainId: 84532,
      timestamp: new Date().toISOString(),
      deployer: wallet.address,
      contracts: {
        DEFAIToken: tokenAddress,
        DeFAIStaking: stakingAddress
      },
      transactionHashes: {
        token: mockToken.deploymentTransaction().hash,
        staking: staking.deploymentTransaction().hash
      },
      escrowFunded: ethers.formatUnits(escrowAmount, 6) + " DEFAI"
    };

    const deploymentPath = `./deployments/base-sepolia_${Date.now()}.json`;
    if (!fs.existsSync("./deployments")) {
      fs.mkdirSync("./deployments");
    }
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT SUCCESSFUL!");
    console.log("=".repeat(60));
    console.log("\n📍 Contract Addresses:");
    console.log(`   DEFAI Token:    ${tokenAddress}`);
    console.log(`   Staking:        ${stakingAddress}`);
    console.log("\n🔍 View on Base Sepolia Explorer:");
    console.log(`   Token:   https://sepolia.basescan.org/address/${tokenAddress}`);
    console.log(`   Staking: https://sepolia.basescan.org/address/${stakingAddress}`);
    console.log("\n📄 Deployment info saved to:", deploymentPath);
    
    // Update .env with deployed addresses
    const envPath = "./.env";
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
      /DEFAI_TOKEN_ADDRESS=.*/,
      `DEFAI_TOKEN_ADDRESS=${tokenAddress}`
    );
    envContent += `\n# Base Sepolia Deployment\nSTAKING_CONTRACT_ADDRESS=${stakingAddress}\n`;
    fs.writeFileSync(envPath, envContent);
    console.log("✅ Updated .env with contract addresses");

    console.log("\n📝 Next Steps:");
    console.log("1. Verify contracts on BaseScan (optional):");
    console.log(`   npx hardhat verify --network baseSepolia ${tokenAddress}`);
    console.log(`   npx hardhat verify --network baseSepolia ${stakingAddress} ${tokenAddress}`);
    console.log("\n2. Test the contracts:");
    console.log("   - Use the faucet function to get test tokens");
    console.log("   - Stake tokens and test the tier system");
    console.log("   - Test rewards claiming and compounding");

  } catch (error) {
    console.error("\n❌ Deployment failed!");
    console.error(error.message);
    if (error.reason) console.error("Reason:", error.reason);
    if (error.code) console.error("Code:", error.code);
    process.exit(1);
  }
}

// Execute deployment
main()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed!");
    console.error(error);
    process.exit(1);
  });