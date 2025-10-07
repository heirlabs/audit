const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("🚀 DRY RUN - Deployment Simulation for Base Sepolia\n");
  console.log("⚠️  This is a simulation showing what will be deployed\n");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deployment Account:", deployer.address);
  
  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Current Balance:", ethers.formatEther(balance), "ETH");
  
  if (parseFloat(ethers.formatEther(balance)) < 0.01) {
    console.log("\n⚠️  WARNING: Insufficient balance for actual deployment!");
    console.log("   This is a DRY RUN - showing expected deployment addresses\n");
  }

  // Calculate expected addresses using CREATE2 or sequential nonce
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  
  console.log("📋 Expected Contract Addresses (deterministic):");
  console.log("=====================================");
  
  // Calculate expected addresses for each contract
  const expectedAddresses = [];
  for (let i = 0; i < 4; i++) {
    const futureAddress = ethers.getCreateAddress({
      from: deployer.address,
      nonce: nonce + i
    });
    expectedAddresses.push(futureAddress);
  }

  console.log("1️⃣ OLD DEFAI Token:", expectedAddresses[0]);
  console.log("2️⃣ DEFAI Token:", expectedAddresses[1]);
  console.log("3️⃣ NFT Contract:", expectedAddresses[2]);
  console.log("4️⃣ Swap Contract:", expectedAddresses[3]);

  // Configuration details
  console.log("\n⚙️ Deployment Configuration:");
  console.log("==============================");
  console.log("Network: Base Sepolia (Chain ID: 84532)");
  console.log("Treasury: ", deployer.address);
  console.log("VRF Coordinator: 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634");
  console.log("\nTier Prices:");
  console.log("├─ Tier 0 (OG): 100 DEFAI");
  console.log("├─ Tier 1 (Train): 200 DEFAI");
  console.log("├─ Tier 2 (Boat): 500 DEFAI");
  console.log("├─ Tier 3 (Plane): 1000 DEFAI");
  console.log("└─ Tier 4 (Rocket): 2000 DEFAI");
  
  console.log("\nTier Supplies:");
  console.log("├─ Tier 0: 100 (50 reserved for OG)");
  console.log("├─ Tier 1: 200");
  console.log("├─ Tier 2: 300");
  console.log("├─ Tier 3: 400");
  console.log("└─ Tier 4: 500");

  console.log("\n📊 Gas Estimates:");
  console.log("==================");
  console.log("MockERC20 deployment: ~0.001 ETH each");
  console.log("NFT deployment: ~0.002 ETH");
  console.log("Swap contract deployment: ~0.004 ETH");
  console.log("Initialization transactions: ~0.001 ETH");
  console.log("Total estimated: ~0.01 ETH");

  // Save dry run info
  const dryRunInfo = {
    type: "DRY_RUN",
    network: "Base Sepolia",
    chainId: 84532,
    deployer: deployer.address,
    currentBalance: ethers.formatEther(balance),
    timestamp: new Date().toISOString(),
    expectedContracts: {
      oldDefai: expectedAddresses[0],
      defai: expectedAddresses[1],
      nft: expectedAddresses[2],
      swap: expectedAddresses[3]
    },
    configuration: {
      treasury: deployer.address,
      vrfCoordinator: "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634",
      vrfKeyHash: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c",
      tierPrices: ["100", "200", "500", "1000", "2000"],
      tierSupplies: [100, 200, 300, 400, 500]
    },
    estimatedGasCost: "0.01 ETH"
  };

  fs.writeFileSync(
    "deployment-dry-run.json",
    JSON.stringify(dryRunInfo, null, 2)
  );

  console.log("\n✅ Dry run complete! Info saved to deployment-dry-run.json");
  
  console.log("\n🚀 Ready to Deploy!");
  console.log("===================");
  console.log("1. Fund your wallet with at least 0.01 Base Sepolia ETH");
  console.log("   Wallet: " + deployer.address);
  console.log("   Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
  console.log("\n2. Once funded, run: npm run deploy:base-sepolia");
  console.log("\n3. After deployment, you'll need to:");
  console.log("   - Create a Chainlink VRF subscription");
  console.log("   - Fund it with LINK tokens");
  console.log("   - Add the swap contract as a consumer");

  console.log("\n📱 QR Code for wallet address:");
  console.log("   Use this to easily copy the address on mobile");
  console.log("   " + deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });