const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("DefaiAppFactory", function () {
  // Fixture to deploy contracts
  async function deployDefaiAppFactoryFixture() {
    const [owner, treasury, creator1, creator2, user1, user2, user3] = await ethers.getSigners();

    // Deploy MockDefaiToken
    const MockDefaiToken = await ethers.getContractFactory("MockDefaiToken");
    const defaiToken = await MockDefaiToken.deploy();
    await defaiToken.deployed();

    // Deploy DefaiAppFactory
    const DefaiAppFactory = await ethers.getContractFactory("DefaiAppFactory");
    const platformFeeBps = 2000; // 20%
    const appFactory = await DefaiAppFactory.deploy(
      defaiToken.address,
      treasury.address,
      platformFeeBps
    );
    await appFactory.deployed();

    // Mint tokens to users and creators
    await defaiToken.mint(user1.address, ethers.utils.parseUnits("10000", 6));
    await defaiToken.mint(user2.address, ethers.utils.parseUnits("10000", 6));
    await defaiToken.mint(user3.address, ethers.utils.parseUnits("10000", 6));
    await defaiToken.mint(creator1.address, ethers.utils.parseUnits("10000", 6));
    await defaiToken.mint(creator2.address, ethers.utils.parseUnits("10000", 6));

    return { appFactory, defaiToken, owner, treasury, creator1, creator2, user1, user2, user3, platformFeeBps };
  }

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      const { appFactory, owner } = await loadFixture(deployDefaiAppFactoryFixture);
      expect(await appFactory.owner()).to.equal(owner.address);
    });

    it("Should set the correct treasury", async function () {
      const { appFactory, treasury } = await loadFixture(deployDefaiAppFactoryFixture);
      expect(await appFactory.treasury()).to.equal(treasury.address);
    });

    it("Should set the correct platform fee", async function () {
      const { appFactory, platformFeeBps } = await loadFixture(deployDefaiAppFactoryFixture);
      expect(await appFactory.platformFeeBps()).to.equal(platformFeeBps);
    });

    it("Should revert deployment with invalid platform fee", async function () {
      const [owner, treasury] = await ethers.getSigners();
      const MockDefaiToken = await ethers.getContractFactory("MockDefaiToken");
      const defaiToken = await MockDefaiToken.deploy();
      
      const DefaiAppFactory = await ethers.getContractFactory("DefaiAppFactory");
      await expect(
        DefaiAppFactory.deploy(defaiToken.address, treasury.address, 10001)
      ).to.be.revertedWith("InvalidPlatformFee");
    });
  });

  describe("App Registration", function () {
    it("Should register an app successfully", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      const maxSupply = 1000;
      const metadataUri = "ipfs://QmTest123";

      await expect(
        appFactory.connect(creator1).registerApp(price, maxSupply, metadataUri)
      ).to.emit(appFactory, "AppRegistered");

      const app = await appFactory.getApp(0);
      expect(app.creator).to.equal(creator1.address);
      expect(app.price).to.equal(price);
      expect(app.maxSupply).to.equal(maxSupply);
      expect(app.metadataUri).to.equal(metadataUri);
      expect(app.isActive).to.be.true;
      expect(app.currentSupply).to.equal(0);
    });

    it("Should revert with zero price", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await expect(
        appFactory.connect(creator1).registerApp(0, 1000, "ipfs://test")
      ).to.be.revertedWith("InvalidPrice");
    });

    it("Should revert with zero max supply", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await expect(
        appFactory.connect(creator1).registerApp(100, 0, "ipfs://test")
      ).to.be.revertedWith("InvalidMaxSupply");
    });

    it("Should revert with metadata URI too long", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      const longUri = "ipfs://" + "a".repeat(100);
      
      await expect(
        appFactory.connect(creator1).registerApp(100, 1000, longUri)
      ).to.be.revertedWith("MetadataUriTooLong");
    });

    it("Should increment app counter correctly", async function () {
      const { appFactory, creator1, creator2 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test1");
      await appFactory.connect(creator2).registerApp(200, 2000, "ipfs://test2");
      
      expect(await appFactory.totalApps()).to.equal(2);
    });
  });

  describe("App Purchase", function () {
    it("Should purchase app access successfully", async function () {
      const { appFactory, defaiToken, creator1, user1, treasury, platformFeeBps } = await loadFixture(deployDefaiAppFactoryFixture);
      
      // Register an app
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      
      // Approve tokens
      await defaiToken.connect(user1).approve(appFactory.address, price);
      
      // Calculate expected fees
      const platformFee = price.mul(platformFeeBps).div(10000);
      const creatorAmount = price.sub(platformFee);
      
      // Get initial balances
      const treasuryInitialBalance = await defaiToken.balanceOf(treasury.address);
      const creatorInitialBalance = await defaiToken.balanceOf(creator1.address);
      
      // Purchase app
      await expect(
        appFactory.connect(user1).purchaseAppAccess(0)
      ).to.emit(appFactory, "AppPurchased")
        .withArgs(0, user1.address, price, platformFee, creatorAmount, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
      
      // Check balances
      expect(await defaiToken.balanceOf(treasury.address)).to.equal(treasuryInitialBalance.add(platformFee));
      expect(await defaiToken.balanceOf(creator1.address)).to.equal(creatorInitialBalance.add(creatorAmount));
      
      // Check user has access
      expect(await appFactory.hasAccess(user1.address, 0)).to.be.true;
      
      // Check SFT balance
      expect(await appFactory.balanceOf(user1.address, 0)).to.equal(1);
      
      // Check app supply updated
      const app = await appFactory.getApp(0);
      expect(app.currentSupply).to.equal(1);
    });

    it("Should revert purchase for non-existent app", async function () {
      const { appFactory, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await expect(
        appFactory.connect(user1).purchaseAppAccess(999)
      ).to.be.revertedWith("AppDoesNotExist");
    });

    it("Should revert purchase for inactive app", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await appFactory.connect(creator1).toggleAppStatus(0);
      
      await defaiToken.connect(user1).approve(appFactory.address, price);
      
      await expect(
        appFactory.connect(user1).purchaseAppAccess(0)
      ).to.be.revertedWith("AppNotActive");
    });

    it("Should revert when max supply reached", async function () {
      const { appFactory, defaiToken, creator1, user1, user2 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1, "ipfs://test"); // Max supply of 1
      
      // First purchase should succeed
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      // Second purchase should fail
      await defaiToken.connect(user2).approve(appFactory.address, price);
      await expect(
        appFactory.connect(user2).purchaseAppAccess(0)
      ).to.be.revertedWith("MaxSupplyReached");
    });

    it("Should revert when user already owns app", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      
      await defaiToken.connect(user1).approve(appFactory.address, price.mul(2));
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      await expect(
        appFactory.connect(user1).purchaseAppAccess(0)
      ).to.be.revertedWith("AlreadyOwnsApp");
    });

    it("Should revert with insufficient balance", async function () {
      const { appFactory, defaiToken, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      const [, , , , , , , poorUser] = await ethers.getSigners();
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      
      await defaiToken.connect(poorUser).approve(appFactory.address, price);
      
      await expect(
        appFactory.connect(poorUser).purchaseAppAccess(0)
      ).to.be.revertedWith("InsufficientBalance");
    });
  });

  describe("App Management", function () {
    it("Should toggle app status", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test");
      
      // Toggle to inactive
      await expect(
        appFactory.connect(creator1).toggleAppStatus(0)
      ).to.emit(appFactory, "AppStatusChanged")
        .withArgs(0, false, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
      
      let app = await appFactory.getApp(0);
      expect(app.isActive).to.be.false;
      
      // Toggle back to active
      await appFactory.connect(creator1).toggleAppStatus(0);
      app = await appFactory.getApp(0);
      expect(app.isActive).to.be.true;
    });

    it("Should revert toggle by non-creator", async function () {
      const { appFactory, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test");
      
      await expect(
        appFactory.connect(user1).toggleAppStatus(0)
      ).to.be.revertedWith("UnauthorizedCreator");
    });

    it("Should update app metadata", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await appFactory.connect(creator1).registerApp(100, 1000, "ipfs://old");
      
      const newUri = "ipfs://new";
      const newPrice = 200;
      
      await expect(
        appFactory.connect(creator1).updateAppMetadata(0, newUri, newPrice)
      ).to.emit(appFactory, "AppMetadataUpdated")
        .withArgs(0, newUri, newPrice, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
      
      const app = await appFactory.getApp(0);
      expect(app.metadataUri).to.equal(newUri);
      expect(app.price).to.equal(newPrice);
    });
  });

  describe("Reviews", function () {
    it("Should submit a review", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      // Register and purchase app
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      // Submit review
      const rating = 5;
      const commentCid = "QmReviewCID123";
      
      await expect(
        appFactory.connect(user1).submitReview(0, rating, commentCid)
      ).to.emit(appFactory, "ReviewSubmitted")
        .withArgs(0, user1.address, rating, commentCid, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
      
      // Check review stored
      const review = await appFactory.appReviews(user1.address, 0);
      expect(review.rating).to.equal(rating);
      expect(review.commentCid).to.equal(commentCid);
      expect(review.exists).to.be.true;
      
      // Check average rating
      const avgRating = await appFactory.getAppAverageRating(0);
      expect(avgRating).to.equal(500); // 5 * 100
    });

    it("Should update a review", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      // Register, purchase, and review
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      await appFactory.connect(user1).submitReview(0, 3, "QmOldReview");
      
      // Update review
      const newRating = 4;
      const newCommentCid = "QmNewReview";
      
      await expect(
        appFactory.connect(user1).updateReview(0, newRating, newCommentCid)
      ).to.emit(appFactory, "ReviewUpdated")
        .withArgs(0, user1.address, newRating, newCommentCid, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
      
      const review = await appFactory.appReviews(user1.address, 0);
      expect(review.rating).to.equal(newRating);
      expect(review.commentCid).to.equal(newCommentCid);
    });

    it("Should revert review without owning app", async function () {
      const { appFactory, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test");
      
      await expect(
        appFactory.connect(user1).submitReview(0, 5, "QmReview")
      ).to.be.revertedWith("MustOwnAppToReview");
    });

    it("Should revert with invalid rating", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      await expect(
        appFactory.connect(user1).submitReview(0, 0, "QmReview")
      ).to.be.revertedWith("InvalidRating");
      
      await expect(
        appFactory.connect(user1).submitReview(0, 6, "QmReview")
      ).to.be.revertedWith("InvalidRating");
    });
  });

  describe("Refunds", function () {
    it("Should process a refund", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      // Register and purchase app
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      // Approve refund amount from creator
      await defaiToken.connect(creator1).approve(appFactory.address, price);
      
      const userBalanceBefore = await defaiToken.balanceOf(user1.address);
      
      // Process refund
      await expect(
        appFactory.connect(creator1).refundPurchase(0, user1.address, "Quality issue")
      ).to.emit(appFactory, "PurchaseRefunded")
        .withArgs(0, user1.address, price, "Quality issue", await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
      
      // Check user received refund
      const userBalanceAfter = await defaiToken.balanceOf(user1.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore.add(price));
      
      // Check access revoked
      expect(await appFactory.hasAccess(user1.address, 0)).to.be.false;
      
      // Check SFT burned
      expect(await appFactory.balanceOf(user1.address, 0)).to.equal(0);
      
      // Check supply decreased
      const app = await appFactory.getApp(0);
      expect(app.currentSupply).to.equal(0);
    });

    it("Should revert refund by non-creator", async function () {
      const { appFactory, defaiToken, creator1, user1, user2 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      await expect(
        appFactory.connect(user2).refundPurchase(0, user1.address, "Reason")
      ).to.be.revertedWith("UnauthorizedCreator");
    });

    it("Should revert duplicate refund", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      await defaiToken.connect(creator1).approve(appFactory.address, price.mul(2));
      await appFactory.connect(creator1).refundPurchase(0, user1.address, "Reason");
      
      await expect(
        appFactory.connect(creator1).refundPurchase(0, user1.address, "Reason")
      ).to.be.revertedWith("NoAccessToRefund");
    });
  });

  describe("Platform Settings", function () {
    it("Should update platform settings", async function () {
      const { appFactory, owner } = await loadFixture(deployDefaiAppFactoryFixture);
      const [, , , , , , , newTreasury] = await ethers.getSigners();
      
      const newFeeBps = 1500; // 15%
      
      await expect(
        appFactory.connect(owner).updatePlatformSettings(newFeeBps, newTreasury.address)
      ).to.emit(appFactory, "PlatformSettingsUpdated");
      
      expect(await appFactory.platformFeeBps()).to.equal(newFeeBps);
      expect(await appFactory.treasury()).to.equal(newTreasury.address);
    });

    it("Should revert settings update by non-owner", async function () {
      const { appFactory, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await expect(
        appFactory.connect(user1).updatePlatformSettings(1000, user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert with invalid platform fee", async function () {
      const { appFactory, owner, treasury } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await expect(
        appFactory.connect(owner).updatePlatformSettings(10001, treasury.address)
      ).to.be.revertedWith("InvalidPlatformFee");
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause contract", async function () {
      const { appFactory, owner, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      // Pause contract
      await appFactory.connect(owner).pause();
      
      // Try to register app while paused
      await expect(
        appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test")
      ).to.be.revertedWith("Pausable: paused");
      
      // Unpause contract
      await appFactory.connect(owner).unpause();
      
      // Should work after unpause
      await expect(
        appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test")
      ).to.emit(appFactory, "AppRegistered");
    });

    it("Should revert pause by non-owner", async function () {
      const { appFactory, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await expect(
        appFactory.connect(user1).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("View Functions", function () {
    it("Should return correct total apps", async function () {
      const { appFactory, creator1, creator2 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      expect(await appFactory.totalApps()).to.equal(0);
      
      await appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test1");
      expect(await appFactory.totalApps()).to.equal(1);
      
      await appFactory.connect(creator2).registerApp(200, 2000, "ipfs://test2");
      expect(await appFactory.totalApps()).to.equal(2);
    });

    it("Should return user purchased apps", async function () {
      const { appFactory, defaiToken, creator1, user1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test1");
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test2");
      
      await defaiToken.connect(user1).approve(appFactory.address, price.mul(2));
      await appFactory.connect(user1).purchaseAppAccess(0);
      await appFactory.connect(user1).purchaseAppAccess(1);
      
      const userApps = await appFactory.getUserPurchasedApps(user1.address);
      expect(userApps.length).to.equal(2);
      expect(userApps[0]).to.equal(0);
      expect(userApps[1]).to.equal(1);
    });

    it("Should return creator apps", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      await appFactory.connect(creator1).registerApp(100, 1000, "ipfs://test1");
      await appFactory.connect(creator1).registerApp(200, 2000, "ipfs://test2");
      
      const creatorApps = await appFactory.getCreatorApps(creator1.address);
      expect(creatorApps.length).to.equal(2);
      expect(creatorApps[0]).to.equal(0);
      expect(creatorApps[1]).to.equal(1);
    });
  });

  describe("ERC1155 Functionality", function () {
    it("Should prevent SFT transfers", async function () {
      const { appFactory, defaiToken, creator1, user1, user2 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const price = ethers.utils.parseUnits("100", 6);
      await appFactory.connect(creator1).registerApp(price, 1000, "ipfs://test");
      await defaiToken.connect(user1).approve(appFactory.address, price);
      await appFactory.connect(user1).purchaseAppAccess(0);
      
      // Try to transfer SFT
      await expect(
        appFactory.connect(user1).safeTransferFrom(user1.address, user2.address, 0, 1, "0x")
      ).to.be.revertedWith("SFTs are non-transferable");
    });

    it("Should return correct URI for token", async function () {
      const { appFactory, creator1 } = await loadFixture(deployDefaiAppFactoryFixture);
      
      const metadataUri = "ipfs://QmMetadata123";
      await appFactory.connect(creator1).registerApp(100, 1000, metadataUri);
      
      expect(await appFactory.uri(0)).to.equal(metadataUri);
    });
  });
});