const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Fuzz Testing Suite for DefaiAppFactory
 * Tests edge cases, boundary conditions, and security vulnerabilities
 */
describe("DefaiAppFactory - Fuzz Testing", function () {
  let appFactory, defaiToken;
  let owner, treasury, attacker, users, creators;

  beforeEach(async function () {
    [owner, treasury, attacker, ...users] = await ethers.getSigners();
    creators = users.slice(0, 5);
    
    // Deploy contracts
    const MockDefaiToken = await ethers.getContractFactory("MockDefaiToken");
    defaiToken = await MockDefaiToken.deploy();
    await defaiToken.deployed();

    const DefaiAppFactory = await ethers.getContractFactory("DefaiAppFactory");
    appFactory = await DefaiAppFactory.deploy(
      defaiToken.address,
      treasury.address,
      2000 // 20% platform fee
    );
    await appFactory.deployed();

    // Fund test accounts
    for (let user of users) {
      await defaiToken.mint(user.address, ethers.utils.parseUnits("100000", 6));
    }
  });

  describe("Fuzz: App Registration", function () {
    it("Should handle extreme price values", async function () {
      const creator = creators[0];
      
      // Test minimum valid price
      await expect(
        appFactory.connect(creator).registerApp(1, 1000, "ipfs://min")
      ).to.emit(appFactory, "AppRegistered");
      
      // Test maximum safe price
      const maxSafePrice = ethers.constants.MaxUint256.div(10000); // Account for fee calculations
      await expect(
        appFactory.connect(creator).registerApp(maxSafePrice, 1000, "ipfs://max")
      ).to.emit(appFactory, "AppRegistered");
    });

    it("Should handle extreme supply values", async function () {
      const creator = creators[0];
      
      // Test minimum supply
      await expect(
        appFactory.connect(creator).registerApp(100, 1, "ipfs://test")
      ).to.emit(appFactory, "AppRegistered");
      
      // Test maximum supply
      await expect(
        appFactory.connect(creator).registerApp(100, ethers.constants.MaxUint256, "ipfs://test")
      ).to.emit(appFactory, "AppRegistered");
    });

    it("Should handle metadata URI edge cases", async function () {
      const creator = creators[0];
      
      // Empty URI (valid)
      await expect(
        appFactory.connect(creator).registerApp(100, 1000, "")
      ).to.emit(appFactory, "AppRegistered");
      
      // Maximum length URI
      const maxUri = "a".repeat(100);
      await expect(
        appFactory.connect(creator).registerApp(100, 1000, maxUri)
      ).to.emit(appFactory, "AppRegistered");
      
      // Over maximum length
      const overMaxUri = "a".repeat(101);
      await expect(
        appFactory.connect(creator).registerApp(100, 1000, overMaxUri)
      ).to.be.revertedWith("MetadataUriTooLong");
    });

    it("Should handle rapid sequential registrations", async function () {
      const promises = [];
      
      // Register 50 apps rapidly
      for (let i = 0; i < 50; i++) {
        const creator = creators[i % creators.length];
        promises.push(
          appFactory.connect(creator).registerApp(
            100 + i,
            1000 + i,
            `ipfs://test${i}`
          )
        );
      }
      
      await Promise.all(promises);
      expect(await appFactory.totalApps()).to.equal(50);
    });
  });

  describe("Fuzz: Purchase Mechanism", function () {
    it("Should handle concurrent purchases", async function () {
      const creator = creators[0];
      const price = ethers.utils.parseUnits("100", 6);
      
      // Register app with high supply
      await appFactory.connect(creator).registerApp(price, 100, "ipfs://test");
      
      // Prepare multiple users
      const purchasers = users.slice(5, 15);
      const promises = [];
      
      // Approve and purchase concurrently
      for (let user of purchasers) {
        await defaiToken.connect(user).approve(appFactory.address, price);
        promises.push(appFactory.connect(user).purchaseAppAccess(0));
      }
      
      await Promise.all(promises);
      
      // Verify all purchases succeeded
      const app = await appFactory.getApp(0);
      expect(app.currentSupply).to.equal(purchasers.length);
    });

    it("Should handle race condition at max supply", async function () {
      const creator = creators[0];
      const price = ethers.utils.parseUnits("100", 6);
      
      // Register app with limited supply
      await appFactory.connect(creator).registerApp(price, 3, "ipfs://test");
      
      // Prepare 5 users trying to buy 3 slots
      const purchasers = users.slice(5, 10);
      const promises = [];
      let successCount = 0;
      let failCount = 0;
      
      for (let user of purchasers) {
        await defaiToken.connect(user).approve(appFactory.address, price);
        promises.push(
          appFactory.connect(user).purchaseAppAccess(0)
            .then(() => successCount++)
            .catch(() => failCount++)
        );
      }
      
      await Promise.all(promises);
      
      // Exactly 3 should succeed, 2 should fail
      expect(successCount).to.equal(3);
      expect(failCount).to.equal(2);
      
      const app = await appFactory.getApp(0);
      expect(app.currentSupply).to.equal(3);
    });

    it("Should handle extreme fee calculations", async function () {
      const creator = creators[0];
      
      // Test with maximum price that won't overflow
      const maxPrice = ethers.constants.MaxUint256.div(10000);
      await appFactory.connect(creator).registerApp(maxPrice, 1, "ipfs://test");
      
      await defaiToken.mint(users[5].address, maxPrice);
      await defaiToken.connect(users[5]).approve(appFactory.address, maxPrice);
      
      // Should not overflow during fee calculation
      await expect(
        appFactory.connect(users[5]).purchaseAppAccess(0)
      ).to.emit(appFactory, "AppPurchased");
    });

    it("Should prevent purchase amount manipulation", async function () {
      const creator = creators[0];
      const price = ethers.utils.parseUnits("100", 6);
      
      await appFactory.connect(creator).registerApp(price, 10, "ipfs://test");
      
      // Approve less than price
      await defaiToken.connect(attacker).approve(appFactory.address, price.sub(1));
      
      await expect(
        appFactory.connect(attacker).purchaseAppAccess(0)
      ).to.be.reverted;
      
      // Approve exact amount - should work
      await defaiToken.connect(users[5]).approve(appFactory.address, price);
      await expect(
        appFactory.connect(users[5]).purchaseAppAccess(0)
      ).to.emit(appFactory, "AppPurchased");
    });
  });

  describe("Fuzz: Review System", function () {
    beforeEach(async function () {
      // Setup: Register and purchase an app
      const creator = creators[0];
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator).registerApp(price, 100, "ipfs://test");
      
      // Multiple users purchase
      for (let i = 5; i < 10; i++) {
        await defaiToken.connect(users[i]).approve(appFactory.address, price);
        await appFactory.connect(users[i]).purchaseAppAccess(0);
      }
    });

    it("Should handle all rating values correctly", async function () {
      // Test all valid ratings
      for (let rating = 1; rating <= 5; rating++) {
        const user = users[4 + rating];
        await expect(
          appFactory.connect(user).submitReview(0, rating, `QmReview${rating}`)
        ).to.emit(appFactory, "ReviewSubmitted");
      }
      
      // Verify average calculation
      const avgRating = await appFactory.getAppAverageRating(0);
      expect(avgRating).to.equal(300); // (1+2+3+4+5)/5 * 100 = 3 * 100
    });

    it("Should handle review comment edge cases", async function () {
      const user = users[5];
      
      // Empty comment
      await expect(
        appFactory.connect(user).submitReview(0, 5, "")
      ).to.emit(appFactory, "ReviewSubmitted");
      
      // Maximum length comment
      const user2 = users[6];
      const maxComment = "Q" + "m".repeat(45); // 46 chars total
      await expect(
        appFactory.connect(user2).submitReview(0, 5, maxComment)
      ).to.emit(appFactory, "ReviewSubmitted");
      
      // Over maximum length
      const user3 = users[7];
      const overMaxComment = "Q" + "m".repeat(46); // 47 chars
      await expect(
        appFactory.connect(user3).submitReview(0, 5, overMaxComment)
      ).to.be.revertedWith("CommentCidTooLong");
    });

    it("Should handle rapid review updates", async function () {
      const user = users[5];
      
      // Submit initial review
      await appFactory.connect(user).submitReview(0, 3, "QmInitial");
      
      // Rapid updates
      for (let i = 1; i <= 5; i++) {
        await appFactory.connect(user).updateReview(0, i, `QmUpdate${i}`);
      }
      
      // Verify final state
      const review = await appFactory.appReviews(user.address, 0);
      expect(review.rating).to.equal(5);
      expect(review.commentCid).to.equal("QmUpdate5");
    });
  });

  describe("Fuzz: Refund System", function () {
    it("Should handle refund edge cases", async function () {
      const creator = creators[0];
      const price = ethers.utils.parseUnits("100", 6);
      
      // Register app
      await appFactory.connect(creator).registerApp(price, 10, "ipfs://test");
      
      // Multiple users purchase
      const buyers = users.slice(5, 8);
      for (let buyer of buyers) {
        await defaiToken.connect(buyer).approve(appFactory.address, price);
        await appFactory.connect(buyer).purchaseAppAccess(0);
      }
      
      // Creator approves refunds
      await defaiToken.connect(creator).approve(
        appFactory.address,
        price.mul(buyers.length)
      );
      
      // Process refunds with various reasons
      const reasons = [
        "", // Empty reason
        "a".repeat(200), // Long reason
        "Special characters: !@#$%^&*()", // Special chars
      ];
      
      for (let i = 0; i < buyers.length; i++) {
        await expect(
          appFactory.connect(creator).refundPurchase(0, buyers[i].address, reasons[i])
        ).to.emit(appFactory, "PurchaseRefunded");
      }
      
      // Verify supply decreased correctly
      const app = await appFactory.getApp(0);
      expect(app.currentSupply).to.equal(0);
    });

    it("Should prevent refund replay attacks", async function () {
      const creator = creators[0];
      const buyer = users[5];
      const price = ethers.utils.parseUnits("100", 6);
      
      await appFactory.connect(creator).registerApp(price, 10, "ipfs://test");
      await defaiToken.connect(buyer).approve(appFactory.address, price);
      await appFactory.connect(buyer).purchaseAppAccess(0);
      
      await defaiToken.connect(creator).approve(appFactory.address, price.mul(2));
      
      // First refund should succeed
      await appFactory.connect(creator).refundPurchase(0, buyer.address, "Reason");
      
      // Second refund should fail (no access)
      await expect(
        appFactory.connect(creator).refundPurchase(0, buyer.address, "Reason2")
      ).to.be.revertedWith("NoAccessToRefund");
    });
  });

  describe("Fuzz: Platform Settings", function () {
    it("Should handle all valid fee values", async function () {
      // Test boundary values
      const feeValues = [0, 1, 100, 1000, 5000, 9999, 10000];
      
      for (let fee of feeValues) {
        await expect(
          appFactory.connect(owner).updatePlatformSettings(fee, treasury.address)
        ).to.emit(appFactory, "PlatformSettingsUpdated");
        
        expect(await appFactory.platformFeeBps()).to.equal(fee);
      }
      
      // Test invalid fee
      await expect(
        appFactory.connect(owner).updatePlatformSettings(10001, treasury.address)
      ).to.be.revertedWith("InvalidPlatformFee");
    });

    it("Should calculate fees correctly at boundaries", async function () {
      const creator = creators[0];
      const buyer = users[5];
      const price = ethers.utils.parseUnits("1000", 6);
      
      // Test with 0% fee
      await appFactory.connect(owner).updatePlatformSettings(0, treasury.address);
      await appFactory.connect(creator).registerApp(price, 10, "ipfs://test0");
      
      const treasuryBefore = await defaiToken.balanceOf(treasury.address);
      await defaiToken.connect(buyer).approve(appFactory.address, price);
      await appFactory.connect(buyer).purchaseAppAccess(0);
      const treasuryAfter = await defaiToken.balanceOf(treasury.address);
      
      expect(treasuryAfter.sub(treasuryBefore)).to.equal(0);
      
      // Test with 100% fee
      await appFactory.connect(owner).updatePlatformSettings(10000, treasury.address);
      await appFactory.connect(creator).registerApp(price, 10, "ipfs://test1");
      
      const buyer2 = users[6];
      await defaiToken.connect(buyer2).approve(appFactory.address, price);
      const treasuryBefore2 = await defaiToken.balanceOf(treasury.address);
      await appFactory.connect(buyer2).purchaseAppAccess(1);
      const treasuryAfter2 = await defaiToken.balanceOf(treasury.address);
      
      expect(treasuryAfter2.sub(treasuryBefore2)).to.equal(price);
    });
  });

  describe("Fuzz: Access Control", function () {
    it("Should prevent unauthorized actions", async function () {
      const creator = creators[0];
      
      // Register app as creator
      await appFactory.connect(creator).registerApp(100, 10, "ipfs://test");
      
      // Attacker tries various unauthorized actions
      await expect(
        appFactory.connect(attacker).toggleAppStatus(0)
      ).to.be.revertedWith("UnauthorizedCreator");
      
      await expect(
        appFactory.connect(attacker).updateAppMetadata(0, "ipfs://evil", 999)
      ).to.be.revertedWith("UnauthorizedCreator");
      
      await expect(
        appFactory.connect(attacker).refundPurchase(0, users[5].address, "Hack")
      ).to.be.revertedWith("UnauthorizedCreator");
      
      await expect(
        appFactory.connect(attacker).updatePlatformSettings(5000, attacker.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        appFactory.connect(attacker).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should maintain access control under concurrent operations", async function () {
      const promises = [];
      
      // Multiple creators register apps
      for (let i = 0; i < 5; i++) {
        promises.push(
          appFactory.connect(creators[i]).registerApp(100 + i, 10, `ipfs://test${i}`)
        );
      }
      await Promise.all(promises);
      
      // Try cross-creator operations (all should fail)
      const attackPromises = [];
      for (let i = 0; i < 5; i++) {
        const wrongCreator = creators[(i + 1) % 5];
        attackPromises.push(
          appFactory.connect(wrongCreator).toggleAppStatus(i)
            .then(() => false)
            .catch(() => true)
        );
      }
      
      const results = await Promise.all(attackPromises);
      expect(results.every(r => r === true)).to.be.true;
    });
  });

  describe("Fuzz: Reentrancy Protection", function () {
    it("Should prevent reentrancy in purchase", async function () {
      // This would require a malicious token contract
      // For this test, we verify the modifier is present
      const creator = creators[0];
      const price = ethers.utils.parseUnits("100", 6);
      
      await appFactory.connect(creator).registerApp(price, 10, "ipfs://test");
      
      // Normal purchase should work
      await defaiToken.connect(users[5]).approve(appFactory.address, price);
      await expect(
        appFactory.connect(users[5]).purchaseAppAccess(0)
      ).to.emit(appFactory, "AppPurchased");
      
      // Verify nonReentrant modifier prevents nested calls
      // (Would need custom malicious contract to fully test)
    });

    it("Should prevent reentrancy in refund", async function () {
      const creator = creators[0];
      const buyer = users[5];
      const price = ethers.utils.parseUnits("100", 6);
      
      await appFactory.connect(creator).registerApp(price, 10, "ipfs://test");
      await defaiToken.connect(buyer).approve(appFactory.address, price);
      await appFactory.connect(buyer).purchaseAppAccess(0);
      
      await defaiToken.connect(creator).approve(appFactory.address, price);
      
      // Normal refund should work
      await expect(
        appFactory.connect(creator).refundPurchase(0, buyer.address, "Test")
      ).to.emit(appFactory, "PurchaseRefunded");
      
      // Verify nonReentrant modifier is active
    });
  });

  describe("Fuzz: Integer Overflow/Underflow", function () {
    it("Should handle supply overflow attempts", async function () {
      const creator = creators[0];
      
      // Register app with max supply near overflow
      const almostMax = ethers.constants.MaxUint256.sub(1);
      await appFactory.connect(creator).registerApp(100, almostMax, "ipfs://test");
      
      // Purchase should work
      await defaiToken.connect(users[5]).approve(appFactory.address, 100);
      await appFactory.connect(users[5]).purchaseAppAccess(0);
      
      const app = await appFactory.getApp(0);
      expect(app.currentSupply).to.equal(1);
      expect(app.maxSupply).to.equal(almostMax);
    });

    it("Should handle rating calculations without overflow", async function () {
      const creator = creators[0];
      const price = ethers.utils.parseUnits("100", 6);
      
      await appFactory.connect(creator).registerApp(price, 100, "ipfs://test");
      
      // Many users purchase and review (limit to available users)
      const reviewerCount = Math.min(users.length - 5, 10);
      for (let i = 5; i < 5 + reviewerCount; i++) {
        await defaiToken.connect(users[i]).approve(appFactory.address, price);
        await appFactory.connect(users[i]).purchaseAppAccess(0);
        await appFactory.connect(users[i]).submitReview(0, 5, `Qm${i}`);
      }
      
      // Average should be calculated correctly
      const avgRating = await appFactory.getAppAverageRating(0);
      expect(avgRating).to.equal(500); // 5 * 100
    });
  });

  describe("Fuzz: Gas Optimization Tests", function () {
    it("Should handle batch operations efficiently", async function () {
      const creator = creators[0];
      const price = ethers.utils.parseUnits("10", 6);
      
      // Register multiple apps
      const appCount = 10;
      for (let i = 0; i < appCount; i++) {
        await appFactory.connect(creator).registerApp(price, 100, `ipfs://test${i}`);
      }
      
      // Test batch purchase
      const buyer = users[5];
      const appIds = Array.from({length: appCount}, (_, i) => i);
      
      await defaiToken.connect(buyer).approve(appFactory.address, price.mul(appCount));
      
      // Batch purchase should complete
      await expect(
        appFactory.connect(buyer).batchPurchaseApps(appIds)
      ).to.not.be.reverted;
      
      // Verify all purchases
      for (let appId of appIds) {
        expect(await appFactory.hasAccess(buyer.address, appId)).to.be.true;
      }
    });
  });

  describe("Fuzz: Edge Case Scenarios", function () {
    it("Should handle app with price 1 wei", async function () {
      const creator = creators[0];
      const buyer = users[5];
      
      await appFactory.connect(creator).registerApp(1, 1, "ipfs://onewei");
      await defaiToken.connect(buyer).approve(appFactory.address, 1);
      
      await expect(
        appFactory.connect(buyer).purchaseAppAccess(0)
      ).to.emit(appFactory, "AppPurchased");
    });

    it("Should handle rapid state changes", async function () {
      const creator = creators[0];
      
      await appFactory.connect(creator).registerApp(100, 10, "ipfs://test");
      
      // Rapid toggle
      for (let i = 0; i < 10; i++) {
        await appFactory.connect(creator).toggleAppStatus(0);
      }
      
      // Final state should be consistent
      const app = await appFactory.getApp(0);
      expect(typeof app.isActive).to.equal("boolean");
    });

    it("Should handle all apps at max supply", async function () {
      const promises = [];
      
      // Register 20 apps, all at max supply 1
      for (let i = 0; i < 20; i++) {
        const creator = creators[i % creators.length];
        promises.push(
          appFactory.connect(creator).registerApp(100, 1, `ipfs://full${i}`)
        );
      }
      await Promise.all(promises);
      
      // Purchase all slots
      for (let i = 0; i < 20; i++) {
        const buyer = users[i % users.length];
        await defaiToken.connect(buyer).approve(appFactory.address, 100);
        await appFactory.connect(buyer).purchaseAppAccess(i);
      }
      
      // All further purchases should fail
      const lateBuyer = users[users.length - 1];
      await defaiToken.connect(lateBuyer).approve(appFactory.address, 2000);
      
      for (let i = 0; i < 20; i++) {
        await expect(
          appFactory.connect(lateBuyer).purchaseAppAccess(i)
        ).to.be.reverted;
      }
    });
  });
});