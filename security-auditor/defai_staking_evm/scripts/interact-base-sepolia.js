
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
