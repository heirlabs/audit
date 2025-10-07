const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting deployment to Base Sepolia...\n");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  
  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH\n");

  // Deploy Mock Tokens
  console.log("1️⃣ Deploying Mock OLD DEFAI Token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const oldDefai = await MockERC20.deploy(
    "Old DEFAI",
    "ODEFAI",
    ethers.parseEther("1000000")
  );
  await oldDefai.waitForDeployment();
  console.log("✅ OLD DEFAI deployed to:", await oldDefai.getAddress());

  console.log("\n2️⃣ Deploying Mock DEFAI Token...");
  const defai = await MockERC20.deploy(
    "DEFAI",
    "DEFAI",
    ethers.parseEther("1000000")
  );
  await defai.waitForDeployment();
  console.log("✅ DEFAI deployed to:", await defai.getAddress());

  // Deploy NFT Contract
  console.log("\n3️⃣ Deploying DefAI NFT Contract...");
  const DefaiNFT = await ethers.getContractFactory("DefaiNFT");
  const nft = await DefaiNFT.deploy(
    "DefAI Bonus NFT",
    "DNFT",
    "https://api.defai.io/nft/"
  );
  await nft.waitForDeployment();
  console.log("✅ DefAI NFT deployed to:", await nft.getAddress());

  // Deploy Main Swap Contract
  console.log("\n4️⃣ Deploying DefAI Swap Contract...");
  const DefaiSwap = await ethers.getContractFactory("DefaiSwap");
  
  // Tier prices in ETH
  const tierPrices = [
    ethers.parseEther("100"),   // Tier 0: OG
    ethers.parseEther("200"),   // Tier 1: Train
    ethers.parseEther("500"),   // Tier 2: Boat
    ethers.parseEther("1000"),  // Tier 3: Plane
    ethers.parseEther("2000")   // Tier 4: Rocket
  ];

  // Base Sepolia Chainlink VRF Configuration
  const vrfCoordinator = "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634";
  const vrfKeyHash = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const vrfSubscriptionId = 1; // You'll need to create a subscription

  const swap = await DefaiSwap.deploy(
    await oldDefai.getAddress(),
    await defai.getAddress(),
    await nft.getAddress(),
    deployer.address, // treasury
    tierPrices,
    vrfCoordinator,
    vrfSubscriptionId,
    vrfKeyHash
  );
  await swap.waitForDeployment();
  console.log("✅ DefAI Swap deployed to:", await swap.getAddress());

  // Grant Minter Role to Swap Contract
  console.log("\n5️⃣ Configuring contracts...");
  const MINTER_ROLE = await nft.MINTER_ROLE();
  const grantTx = await nft.grantRole(MINTER_ROLE, await swap.getAddress());
  await grantTx.wait();
  console.log("✅ Granted MINTER_ROLE to swap contract");

  // Initialize Collection
  const tierSupplies = [100, 200, 300, 400, 500];
  const ogTier0Supply = 50; // Reserve 50 for OG holders
  
  // Create mock merkle roots for testing
  const ogMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes("OG_MERKLE_ROOT"));
  const airdropMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes("AIRDROP_MERKLE_ROOT"));

  const initTx = await swap.initializeCollection(
    tierSupplies,
    ogMerkleRoot,
    airdropMerkleRoot,
    ogTier0Supply
  );
  await initTx.wait();
  console.log("✅ Collection initialized");

  // Transfer some tokens to deployer for testing
  console.log("\n6️⃣ Distributing test tokens...");
  const transferAmount = ethers.parseEther("10000");
  await oldDefai.transfer(deployer.address, transferAmount);
  await defai.transfer(deployer.address, transferAmount);
  console.log("✅ Transferred 10,000 of each token to deployer");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Addresses:");
  console.log("├─ OLD DEFAI Token:", await oldDefai.getAddress());
  console.log("├─ DEFAI Token:", await defai.getAddress());
  console.log("├─ NFT Contract:", await nft.getAddress());
  console.log("└─ Swap Contract:", await swap.getAddress());
  
  console.log("\n⚙️ Configuration:");
  console.log("├─ Treasury:", deployer.address);
  console.log("├─ VRF Coordinator:", vrfCoordinator);
  console.log("└─ Chain: Base Sepolia (84532)");

  console.log("\n💡 Next Steps:");
  console.log("1. Create a Chainlink VRF subscription at https://vrf.chain.link");
  console.log("2. Fund the subscription with LINK tokens");
  console.log("3. Add the swap contract as a consumer");
  console.log("4. Update the VRF subscription ID in the swap contract if needed");

  // Save deployment info
  const deploymentInfo = {
    network: "Base Sepolia",
    chainId: 84532,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      oldDefai: await oldDefai.getAddress(),
      defai: await defai.getAddress(),
      nft: await nft.getAddress(),
      swap: await swap.getAddress()
    },
    configuration: {
      treasury: deployer.address,
      vrfCoordinator: vrfCoordinator,
      vrfKeyHash: vrfKeyHash,
      vrfSubscriptionId: vrfSubscriptionId,
      tierPrices: tierPrices.map(p => ethers.formatEther(p) + " ETH"),
      tierSupplies: tierSupplies
    }
  };

  // Save to file
  const fs = require("fs");
  fs.writeFileSync(
    "deployment-base-sepolia.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n📄 Deployment info saved to deployment-base-sepolia.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });