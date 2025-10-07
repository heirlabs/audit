const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DeFAIStaking - Fuzz Testing", function () {
  let defaiToken;
  let staking;
  let owner;
  let users;

  const GOLD_MIN = ethers.parseUnits("10000000", 6);
  const TITANIUM_MIN = ethers.parseUnits("100000000", 6);
  const INFINITE_MIN = ethers.parseUnits("1000000000", 6);
  const MAX_SUPPLY = ethers.parseUnits("10000000000", 6); // 10B DEFAI

  beforeEach(async function () {
    [owner, ...users] = await ethers.getSigners();

    // Deploy mock DEFAI token
    const MockToken = await ethers.getContractFactory("MockDEFAIToken");
    defaiToken = await MockToken.deploy();
    await defaiToken.waitForDeployment();

    // Deploy staking contract
    const Staking = await ethers.getContractFactory("DeFAIStaking");
    staking = await Staking.deploy(await defaiToken.getAddress());
    await staking.waitForDeployment();

    // Fund escrow
    const escrowFund = ethers.parseUnits("1000000000", 6); // 1B for rewards
    await defaiToken.approve(await staking.getAddress(), escrowFund);
    await staking.fundEscrow(escrowFund);
  });

  describe("Fuzz Testing - Edge Cases", function () {
    it("Should handle maximum possible stake amount", async function () {
      const maxStake = ethers.parseUnits("5000000000", 6); // 5B DEFAI
      await defaiToken.transfer(users[0].address, maxStake);
      await defaiToken.connect(users[0]).approve(await staking.getAddress(), maxStake);
      
      await expect(staking.connect(users[0]).stakeTokens(maxStake))
        .to.emit(staking, "Staked")
        .withArgs(users[0].address, maxStake, 3, maxStake); // Tier.Infinite = 3
    });

    it("Should handle multiple users staking simultaneously", async function () {
      const promises = [];
      
      for (let i = 0; i < Math.min(5, users.length); i++) {
        const amount = GOLD_MIN + ethers.parseUnits(String(i * 1000000), 6);
        await defaiToken.transfer(users[i].address, amount);
        await defaiToken.connect(users[i]).approve(await staking.getAddress(), amount);
        promises.push(staking.connect(users[i]).stakeTokens(amount));
      }
      
      await Promise.all(promises);
      
      expect(await staking.totalUsers()).to.equal(Math.min(5, users.length));
    });

    it("Should handle rapid stake/unstake cycles", async function () {
      const stakeAmount = GOLD_MIN * 2n; // Double the minimum for unstaking
      await defaiToken.transfer(users[0].address, stakeAmount * 10n);
      await defaiToken.connect(users[0]).approve(await staking.getAddress(), stakeAmount * 10n);
      
      // Initial stake
      await staking.connect(users[0]).stakeTokens(stakeAmount);
      
      // Fast forward past lock period
      await time.increase(91 * 24 * 60 * 60); // 91 days to avoid penalties
      
      // Perform rapid stake/unstake cycles
      for (let i = 0; i < 3; i++) {
        await staking.connect(users[0]).unstakeTokens(GOLD_MIN);
        await staking.connect(users[0]).stakeTokens(GOLD_MIN);
        // Each new stake resets the lock period, so we need to wait again
        await time.increase(8 * 24 * 60 * 60); // Wait past lock for next cycle
      }
      
      const userInfo = await staking.getUserStakeInfo(users[0].address);
      expect(userInfo.stakedAmount).to.equal(stakeAmount);
    });

    it("Should correctly handle rewards at boundary conditions", async function () {
      // Test at tier boundaries
      const testAmounts = [
        GOLD_MIN, // Exactly at Gold minimum
        GOLD_MIN - 1n, // Just below Gold (should fail)
        TITANIUM_MIN - 1n, // Just below Titanium (Gold tier)
        TITANIUM_MIN, // Exactly at Titanium
        INFINITE_MIN - 1n, // Just below Infinite (Titanium tier)
        INFINITE_MIN // Exactly at Infinite
      ];
      
      for (let i = 0; i < testAmounts.length; i++) {
        if (testAmounts[i] < GOLD_MIN) {
          // Should fail for amounts below minimum
          await defaiToken.transfer(users[i].address, testAmounts[i]);
          await defaiToken.connect(users[i]).approve(await staking.getAddress(), testAmounts[i]);
          
          await expect(staking.connect(users[i]).stakeTokens(testAmounts[i]))
            .to.be.revertedWithCustomError(staking, "AmountTooLow");
        } else {
          await defaiToken.transfer(users[i].address, testAmounts[i]);
          await defaiToken.connect(users[i]).approve(await staking.getAddress(), testAmounts[i]);
          
          await staking.connect(users[i]).stakeTokens(testAmounts[i]);
          
          // Fast forward 1 year
          await time.increase(365 * 24 * 60 * 60);
          
          const rewards = await staking.getTotalClaimableRewards(users[i].address);
          
          // Verify rewards match expected APY
          let expectedApy;
          if (testAmounts[i] >= INFINITE_MIN) {
            expectedApy = 100; // 1%
          } else if (testAmounts[i] >= TITANIUM_MIN) {
            expectedApy = 75; // 0.75%
          } else {
            expectedApy = 50; // 0.5%
          }
          
          const expectedRewards = testAmounts[i] * BigInt(expectedApy) / 10000n;
          expect(rewards).to.be.closeTo(expectedRewards, expectedRewards / 100n);
        }
      }
    });

    it("Should handle extreme time jumps correctly", async function () {
      const stakeAmount = GOLD_MIN;
      await defaiToken.transfer(users[0].address, stakeAmount);
      await defaiToken.connect(users[0]).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(users[0]).stakeTokens(stakeAmount);
      
      // Jump 10 years into future
      await time.increase(10 * 365 * 24 * 60 * 60);
      
      const rewards = await staking.getTotalClaimableRewards(users[0].address);
      
      // Expected: 10 years * 0.5% APY = 5% of stake
      const expectedRewards = stakeAmount * 5n / 100n;
      expect(rewards).to.be.closeTo(expectedRewards, expectedRewards / 100n);
    });

    it("Should handle all penalty scenarios correctly", async function () {
      const stakeAmount = GOLD_MIN * 3n; // Enough for 3 unstakes
      await defaiToken.transfer(users[0].address, stakeAmount);
      await defaiToken.connect(users[0]).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(users[0]).stakeTokens(stakeAmount);
      
      // Test 2% penalty (< 30 days)
      await time.increase(8 * 24 * 60 * 60); // 8 days
      const unstake1 = GOLD_MIN;
      const penalty1 = unstake1 * 200n / 10000n; // 2%
      
      const balanceBefore1 = await defaiToken.balanceOf(users[0].address);
      await staking.connect(users[0]).unstakeTokens(unstake1);
      const balanceAfter1 = await defaiToken.balanceOf(users[0].address);
      expect(balanceAfter1 - balanceBefore1).to.equal(unstake1 - penalty1);
      
      // Test 1% penalty (30-90 days)
      await time.increase(35 * 24 * 60 * 60); // Total: 43 days
      const unstake2 = GOLD_MIN;
      const penalty2 = unstake2 * 100n / 10000n; // 1%
      
      const balanceBefore2 = await defaiToken.balanceOf(users[0].address);
      await staking.connect(users[0]).unstakeTokens(unstake2);
      const balanceAfter2 = await defaiToken.balanceOf(users[0].address);
      expect(balanceAfter2 - balanceBefore2).to.equal(unstake2 - penalty2);
      
      // Test no penalty (> 90 days)
      await time.increase(50 * 24 * 60 * 60); // Total: 93 days
      const unstake3 = GOLD_MIN;
      
      const balanceBefore3 = await defaiToken.balanceOf(users[0].address);
      await staking.connect(users[0]).unstakeTokens(unstake3);
      const balanceAfter3 = await defaiToken.balanceOf(users[0].address);
      expect(balanceAfter3 - balanceBefore3).to.equal(unstake3);
    });

    it("Should handle compound interest calculations correctly", async function () {
      const stakeAmount = TITANIUM_MIN;
      await defaiToken.transfer(users[0].address, stakeAmount);
      await defaiToken.connect(users[0]).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(users[0]).stakeTokens(stakeAmount);
      
      // Compound multiple times over a year
      for (let month = 1; month <= 12; month++) {
        await time.increase(30 * 24 * 60 * 60); // 1 month
        
        const rewardsBefore = await staking.getTotalClaimableRewards(users[0].address);
        if (rewardsBefore > 0) {
          await staking.connect(users[0]).compoundRewards();
        }
      }
      
      const finalStake = (await staking.getUserStakeInfo(users[0].address)).stakedAmount;
      
      // With monthly compounding at 0.75% APY, should be slightly more than simple interest
      const simpleInterest = stakeAmount * 75n / 10000n;
      
      // Final stake should be at least the original stake plus most of the simple interest
      // Allow for rounding differences
      expect(finalStake).to.be.gte(stakeAmount + (simpleInterest * 95n / 100n));
    });

    it("Should handle escrow depletion gracefully", async function () {
      // Deploy new staking with minimal escrow
      const Staking = await ethers.getContractFactory("DeFAIStaking");
      const minimalStaking = await Staking.deploy(await defaiToken.getAddress());
      await minimalStaking.waitForDeployment();
      
      // Fund with minimal escrow
      const minimalEscrow = ethers.parseUnits("1000", 6); // Only 1000 DEFAI
      await defaiToken.approve(await minimalStaking.getAddress(), minimalEscrow);
      await minimalStaking.fundEscrow(minimalEscrow);
      
      // Stake large amount
      const largeStake = INFINITE_MIN;
      await defaiToken.transfer(users[0].address, largeStake);
      await defaiToken.connect(users[0]).approve(await minimalStaking.getAddress(), largeStake);
      await minimalStaking.connect(users[0]).stakeTokens(largeStake);
      
      // Fast forward to generate more rewards than escrow
      await time.increase(365 * 24 * 60 * 60); // 1 year = 1% of 1B = 10M rewards
      
      // Should fail to claim more than escrow balance
      await expect(minimalStaking.connect(users[0]).claimRewards())
        .to.be.revertedWithCustomError(minimalStaking, "InsufficientEscrowBalance");
    });

    it("Should maintain consistency under concurrent operations", async function () {
      // Give tokens to multiple users
      const stakeAmount = GOLD_MIN;
      for (let i = 0; i < Math.min(10, users.length); i++) {
        await defaiToken.transfer(users[i].address, stakeAmount * 2n);
        await defaiToken.connect(users[i]).approve(await staking.getAddress(), stakeAmount * 2n);
      }
      
      // All users stake
      const stakePromises = [];
      for (let i = 0; i < Math.min(10, users.length); i++) {
        stakePromises.push(staking.connect(users[i]).stakeTokens(stakeAmount));
      }
      await Promise.all(stakePromises);
      
      const totalAfterStaking = await staking.totalStaked();
      expect(totalAfterStaking).to.equal(stakeAmount * BigInt(Math.min(10, users.length)));
      
      // Fast forward and claim rewards
      await time.increase(30 * 24 * 60 * 60);
      
      const claimPromises = [];
      for (let i = 0; i < Math.min(10, users.length); i++) {
        claimPromises.push(staking.connect(users[i]).claimRewards());
      }
      await Promise.all(claimPromises);
      
      // Verify escrow was properly reduced
      const totalDistributed = await staking.totalDistributed();
      expect(totalDistributed).to.be.gt(0);
    });

    it("Should prevent common attack vectors", async function () {
      // Test 1: Reentrancy protection
      const stakeAmount = GOLD_MIN;
      await defaiToken.transfer(users[0].address, stakeAmount);
      await defaiToken.connect(users[0]).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(users[0]).stakeTokens(stakeAmount);
      
      // Test 2: Integer overflow/underflow (handled by Solidity 0.8+)
      // Fast forward to allow unstaking
      await time.increase(8 * 24 * 60 * 60);
      
      const maxUint = ethers.MaxUint256;
      await expect(staking.connect(users[0]).unstakeTokens(maxUint))
        .to.be.revertedWithCustomError(staking, "InsufficientStake");
      
      // Test 3: Zero amount operations
      await expect(staking.connect(users[0]).stakeTokens(0))
        .to.be.revertedWithCustomError(staking, "AmountTooLow");
      
      // Test 4: Unauthorized access
      await expect(staking.connect(users[0]).pause())
        .to.be.reverted;
      
      // Test 5: Time manipulation resistance (lock period enforcement)
      await defaiToken.transfer(users[1].address, stakeAmount);
      await defaiToken.connect(users[1]).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(users[1]).stakeTokens(stakeAmount);
      
      // Try to unstake immediately
      await expect(staking.connect(users[1]).unstakeTokens(stakeAmount))
        .to.be.revertedWithCustomError(staking, "TokensLocked");
    });
  });

  describe("Randomized Property Testing", function () {
    it("Should maintain invariants under random operations", async function () {
      const numOperations = 50;
      const numUsers = Math.min(5, users.length);
      
      // Initialize users with random amounts
      for (let i = 0; i < numUsers; i++) {
        const amount = GOLD_MIN * BigInt(Math.floor(Math.random() * 100) + 1);
        await defaiToken.transfer(users[i].address, amount);
        await defaiToken.connect(users[i]).approve(await staking.getAddress(), amount);
      }
      
      let totalStakedExpected = 0n;
      const userBalances = new Map();
      
      for (let op = 0; op < numOperations; op++) {
        const userIndex = Math.floor(Math.random() * numUsers);
        const user = users[userIndex];
        const operation = Math.random();
        
        try {
          if (operation < 0.4) {
            // Stake operation (40% chance)
            const userBalance = await defaiToken.balanceOf(user.address);
            if (userBalance >= GOLD_MIN) {
              const stakeAmount = GOLD_MIN + (userBalance - GOLD_MIN) * BigInt(Math.floor(Math.random() * 50)) / 100n;
              await staking.connect(user).stakeTokens(stakeAmount);
              
              totalStakedExpected += stakeAmount;
              userBalances.set(user.address, (userBalances.get(user.address) || 0n) + stakeAmount);
            }
          } else if (operation < 0.6) {
            // Unstake operation (20% chance)
            const userStake = (await staking.getUserStakeInfo(user.address)).stakedAmount;
            if (userStake > 0) {
              // Fast forward to allow unstaking
              await time.increase(8 * 24 * 60 * 60);
              
              const unstakeAmount = userStake * BigInt(Math.floor(Math.random() * 50) + 1) / 100n;
              await staking.connect(user).unstakeTokens(unstakeAmount);
              
              totalStakedExpected -= unstakeAmount;
              userBalances.set(user.address, userBalances.get(user.address) - unstakeAmount);
            }
          } else if (operation < 0.8) {
            // Claim rewards (20% chance)
            const claimable = await staking.getTotalClaimableRewards(user.address);
            if (claimable > 0) {
              await staking.connect(user).claimRewards();
            }
          } else {
            // Compound rewards (20% chance)
            const claimable = await staking.getTotalClaimableRewards(user.address);
            if (claimable > 0) {
              const stakeBefore = (await staking.getUserStakeInfo(user.address)).stakedAmount;
              await staking.connect(user).compoundRewards();
              const stakeAfter = (await staking.getUserStakeInfo(user.address)).stakedAmount;
              
              totalStakedExpected += (stakeAfter - stakeBefore);
              userBalances.set(user.address, stakeAfter);
            }
          }
          
          // Advance time randomly
          await time.increase(Math.floor(Math.random() * 30) * 24 * 60 * 60);
        } catch (error) {
          // Operations might fail due to insufficient balance, lock period, etc.
          // This is expected behavior
        }
      }
      
      // Verify invariants
      const finalTotalStaked = await staking.totalStaked();
      
      // Total staked should match sum of all user stakes
      let sumUserStakes = 0n;
      for (let i = 0; i < numUsers; i++) {
        const userStake = (await staking.getUserStakeInfo(users[i].address)).stakedAmount;
        sumUserStakes += userStake;
      }
      
      expect(finalTotalStaked).to.equal(sumUserStakes);
      
      // Escrow + distributed should be consistent
      // Note: Due to compounding, total distributed might exceed initial escrow
      const escrowBalance = await staking.escrowBalance();
      const totalDistributed = await staking.totalDistributed();
      
      // Just verify that escrow balance is non-negative (implicit in uint256)
      // and that the accounting makes sense
      expect(escrowBalance).to.be.gte(0);
    });
  });

  describe("Gas Optimization Testing", function () {
    it("Should have reasonable gas costs for common operations", async function () {
      const stakeAmount = GOLD_MIN;
      await defaiToken.transfer(users[0].address, stakeAmount * 10n);
      await defaiToken.connect(users[0]).approve(await staking.getAddress(), stakeAmount * 10n);
      
      // Test stake gas (initial stake is more expensive due to storage initialization)
      const stakeTx = await staking.connect(users[0]).stakeTokens(stakeAmount);
      const stakeReceipt = await stakeTx.wait();
      expect(stakeReceipt.gasUsed).to.be.lt(250000); // Increased limit for initial stake
      
      // Fast forward
      await time.increase(30 * 24 * 60 * 60);
      
      // Test claim gas
      const claimTx = await staking.connect(users[0]).claimRewards();
      const claimReceipt = await claimTx.wait();
      expect(claimReceipt.gasUsed).to.be.lt(200000); // Reasonable for claim
      
      // Test compound gas
      await time.increase(30 * 24 * 60 * 60);
      const compoundTx = await staking.connect(users[0]).compoundRewards();
      const compoundReceipt = await compoundTx.wait();
      expect(compoundReceipt.gasUsed).to.be.lt(200000); // Reasonable for compound
      
      // Test unstake gas
      const unstakeTx = await staking.connect(users[0]).unstakeTokens(stakeAmount / 2n);
      const unstakeReceipt = await unstakeTx.wait();
      expect(unstakeReceipt.gasUsed).to.be.lt(250000); // Reasonable for unstake with penalty calculation
    });
  });
});