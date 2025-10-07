const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DeFAIStaking", function () {
  let defaiToken;
  let staking;
  let owner;
  let user1;
  let user2;
  let user3;

  const GOLD_MIN = ethers.parseUnits("10000000", 6); // 10M DEFAI
  const TITANIUM_MIN = ethers.parseUnits("100000000", 6); // 100M DEFAI
  const INFINITE_MIN = ethers.parseUnits("1000000000", 6); // 1B DEFAI

  const INITIAL_SUPPLY = ethers.parseUnits("10000000000", 6); // 10B DEFAI
  const ESCROW_FUND = ethers.parseUnits("100000000", 6); // 100M DEFAI for rewards

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock DEFAI token
    const MockToken = await ethers.getContractFactory("MockDEFAIToken");
    defaiToken = await MockToken.deploy();
    await defaiToken.waitForDeployment();

    // Deploy staking contract
    const Staking = await ethers.getContractFactory("DeFAIStaking");
    staking = await Staking.deploy(await defaiToken.getAddress());
    await staking.waitForDeployment();

    // Distribute tokens to users for testing
    await defaiToken.transfer(user1.address, ethers.parseUnits("500000000", 6)); // 500M
    await defaiToken.transfer(user2.address, ethers.parseUnits("2000000000", 6)); // 2B
    await defaiToken.transfer(user3.address, ethers.parseUnits("50000000", 6)); // 50M

    // Fund escrow for rewards
    await defaiToken.approve(await staking.getAddress(), ESCROW_FUND);
    await staking.fundEscrow(ESCROW_FUND);
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await staking.defaiToken()).to.equal(await defaiToken.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await staking.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero staked", async function () {
      expect(await staking.totalStaked()).to.equal(0);
      expect(await staking.totalUsers()).to.equal(0);
    });
  });

  describe("Staking", function () {
    it("Should allow staking above minimum", async function () {
      const stakeAmount = GOLD_MIN;
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      
      await expect(staking.connect(user1).stakeTokens(stakeAmount))
        .to.emit(staking, "Staked")
        .withArgs(user1.address, stakeAmount, 1, stakeAmount); // Tier.Gold = 1
      
      const userInfo = await staking.getUserStakeInfo(user1.address);
      expect(userInfo.stakedAmount).to.equal(stakeAmount);
      expect(userInfo.tier).to.equal(1); // Gold tier
    });

    it("Should reject staking below minimum", async function () {
      const stakeAmount = ethers.parseUnits("5000000", 6); // 5M DEFAI (below minimum)
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      
      await expect(staking.connect(user1).stakeTokens(stakeAmount))
        .to.be.revertedWithCustomError(staking, "AmountTooLow");
    });

    it("Should correctly assign tiers", async function () {
      // Gold tier
      const goldAmount = ethers.parseUnits("50000000", 6); // 50M
      await defaiToken.connect(user3).approve(await staking.getAddress(), goldAmount);
      await staking.connect(user3).stakeTokens(goldAmount);
      let userInfo = await staking.getUserStakeInfo(user3.address);
      expect(userInfo.tier).to.equal(1); // Gold

      // Titanium tier
      const titaniumAmount = ethers.parseUnits("150000000", 6); // 150M
      await defaiToken.connect(user1).approve(await staking.getAddress(), titaniumAmount);
      await staking.connect(user1).stakeTokens(titaniumAmount);
      userInfo = await staking.getUserStakeInfo(user1.address);
      expect(userInfo.tier).to.equal(2); // Titanium

      // Infinite tier
      const infiniteAmount = ethers.parseUnits("1500000000", 6); // 1.5B
      await defaiToken.connect(user2).approve(await staking.getAddress(), infiniteAmount);
      await staking.connect(user2).stakeTokens(infiniteAmount);
      userInfo = await staking.getUserStakeInfo(user2.address);
      expect(userInfo.tier).to.equal(3); // Infinite
    });

    it("Should update total staked and users", async function () {
      const stakeAmount = GOLD_MIN;
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stakeTokens(stakeAmount);
      
      expect(await staking.totalStaked()).to.equal(stakeAmount);
      expect(await staking.totalUsers()).to.equal(1);
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      // User1 stakes first
      const stakeAmount = ethers.parseUnits("50000000", 6); // 50M
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stakeTokens(stakeAmount);
    });

    it("Should not allow unstaking during lock period", async function () {
      await expect(staking.connect(user1).unstakeTokens(ethers.parseUnits("10000000", 6)))
        .to.be.revertedWithCustomError(staking, "TokensLocked");
    });

    it("Should allow unstaking after lock period", async function () {
      // Fast forward 7 days
      await time.increase(7 * 24 * 60 * 60);
      
      const unstakeAmount = ethers.parseUnits("10000000", 6); // 10M
      await expect(staking.connect(user1).unstakeTokens(unstakeAmount))
        .to.emit(staking, "Unstaked");
    });

    it("Should apply penalty for early unstaking (< 30 days)", async function () {
      // Fast forward 8 days (past lock, but < 30 days)
      await time.increase(8 * 24 * 60 * 60);
      
      const unstakeAmount = ethers.parseUnits("10000000", 6); // 10M
      const expectedPenalty = unstakeAmount * 200n / 10000n; // 2% penalty
      
      const balanceBefore = await defaiToken.balanceOf(user1.address);
      await staking.connect(user1).unstakeTokens(unstakeAmount);
      const balanceAfter = await defaiToken.balanceOf(user1.address);
      
      expect(balanceAfter - balanceBefore).to.equal(unstakeAmount - expectedPenalty);
    });

    it("Should apply reduced penalty for 30-90 day period", async function () {
      // Fast forward 45 days
      await time.increase(45 * 24 * 60 * 60);
      
      const unstakeAmount = ethers.parseUnits("10000000", 6); // 10M
      const expectedPenalty = unstakeAmount * 100n / 10000n; // 1% penalty
      
      const balanceBefore = await defaiToken.balanceOf(user1.address);
      await staking.connect(user1).unstakeTokens(unstakeAmount);
      const balanceAfter = await defaiToken.balanceOf(user1.address);
      
      expect(balanceAfter - balanceBefore).to.equal(unstakeAmount - expectedPenalty);
    });

    it("Should not apply penalty after 90 days", async function () {
      // Fast forward 91 days
      await time.increase(91 * 24 * 60 * 60);
      
      const unstakeAmount = ethers.parseUnits("10000000", 6); // 10M
      
      const balanceBefore = await defaiToken.balanceOf(user1.address);
      await staking.connect(user1).unstakeTokens(unstakeAmount);
      const balanceAfter = await defaiToken.balanceOf(user1.address);
      
      expect(balanceAfter - balanceBefore).to.equal(unstakeAmount);
    });
  });

  describe("Rewards", function () {
    beforeEach(async function () {
      // User1 stakes Gold tier
      const stakeAmount = ethers.parseUnits("50000000", 6); // 50M
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stakeTokens(stakeAmount);
    });

    it("Should accrue rewards over time", async function () {
      // Fast forward 365 days
      await time.increase(365 * 24 * 60 * 60);
      
      const rewards = await staking.getTotalClaimableRewards(user1.address);
      
      // Expected rewards: 50M * 0.5% = 250k DEFAI
      const expectedRewards = ethers.parseUnits("250000", 6);
      
      // Allow 0.1% variance for rounding
      expect(rewards).to.be.closeTo(expectedRewards, expectedRewards / 1000n);
    });

    it("Should allow claiming rewards", async function () {
      // Fast forward 30 days
      await time.increase(30 * 24 * 60 * 60);
      
      const balanceBefore = await defaiToken.balanceOf(user1.address);
      await staking.connect(user1).claimRewards();
      const balanceAfter = await defaiToken.balanceOf(user1.address);
      
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should compound rewards", async function () {
      // Fast forward 30 days
      await time.increase(30 * 24 * 60 * 60);
      
      const stakeBefore = (await staking.getUserStakeInfo(user1.address)).stakedAmount;
      await staking.connect(user1).compoundRewards();
      const stakeAfter = (await staking.getUserStakeInfo(user1.address)).stakedAmount;
      
      expect(stakeAfter).to.be.gt(stakeBefore);
    });

    it("Should have different APY for different tiers", async function () {
      // User2 stakes Infinite tier
      const infiniteStake = ethers.parseUnits("1500000000", 6); // 1.5B
      await defaiToken.connect(user2).approve(await staking.getAddress(), infiniteStake);
      await staking.connect(user2).stakeTokens(infiniteStake);
      
      // Fast forward 365 days
      await time.increase(365 * 24 * 60 * 60);
      
      const goldRewards = await staking.getTotalClaimableRewards(user1.address);
      const infiniteRewards = await staking.getTotalClaimableRewards(user2.address);
      
      // Gold: 50M * 0.5% = 250k
      // Infinite: 1.5B * 1% = 15M
      const expectedGold = ethers.parseUnits("250000", 6);
      const expectedInfinite = ethers.parseUnits("15000000", 6);
      
      expect(goldRewards).to.be.closeTo(expectedGold, expectedGold / 1000n);
      expect(infiniteRewards).to.be.closeTo(expectedInfinite, expectedInfinite / 1000n);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to pause", async function () {
      await staking.pause();
      
      const stakeAmount = GOLD_MIN;
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      
      await expect(staking.connect(user1).stakeTokens(stakeAmount))
        .to.be.revertedWith("Pausable: paused");
    });

    it("Should allow owner to unpause", async function () {
      await staking.pause();
      await staking.unpause();
      
      const stakeAmount = GOLD_MIN;
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      
      await expect(staking.connect(user1).stakeTokens(stakeAmount))
        .to.emit(staking, "Staked");
    });

    it("Should implement timelock for ownership transfer", async function () {
      await staking.initiateOwnershipTransfer(user1.address);
      
      // Should fail before timelock
      await expect(staking.connect(user1).acceptOwnershipTransfer())
        .to.be.revertedWithCustomError(staking, "TimelockNotExpired");
      
      // Fast forward 48 hours
      await time.increase(48 * 60 * 60);
      
      // Should succeed after timelock
      await staking.connect(user1).acceptOwnershipTransfer();
      expect(await staking.owner()).to.equal(user1.address);
    });

    it("Should implement emergency withdrawal with timelock", async function () {
      await staking.initiateEmergencyWithdrawal();
      
      // Should fail before timelock
      await expect(staking.executeEmergencyWithdrawal(await defaiToken.getAddress(), ethers.parseUnits("1000", 6)))
        .to.be.revertedWithCustomError(staking, "TimelockNotExpired");
      
      // Fast forward 48 hours
      await time.increase(48 * 60 * 60);
      
      // Should succeed after timelock
      const amount = ethers.parseUnits("1000", 6);
      await staking.executeEmergencyWithdrawal(await defaiToken.getAddress(), amount);
    });
  });

  describe("Escrow Management", function () {
    it("Should track escrow balance", async function () {
      expect(await staking.escrowBalance()).to.equal(ESCROW_FUND);
    });

    it("Should allow funding escrow", async function () {
      const additionalFund = ethers.parseUnits("50000000", 6); // 50M
      await defaiToken.approve(await staking.getAddress(), additionalFund);
      
      await expect(staking.fundEscrow(additionalFund))
        .to.emit(staking, "EscrowFunded")
        .withArgs(owner.address, additionalFund, ESCROW_FUND + additionalFund);
      
      expect(await staking.escrowBalance()).to.equal(ESCROW_FUND + additionalFund);
    });

    it("Should reduce escrow balance when rewards are claimed", async function () {
      // User stakes and earns rewards
      const stakeAmount = ethers.parseUnits("50000000", 6); // 50M
      await defaiToken.connect(user1).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stakeTokens(stakeAmount);
      
      // Fast forward 30 days
      await time.increase(30 * 24 * 60 * 60);
      
      const escrowBefore = await staking.escrowBalance();
      await staking.connect(user1).claimRewards();
      const escrowAfter = await staking.escrowBalance();
      
      expect(escrowAfter).to.be.lt(escrowBefore);
    });
  });
});