const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DefaiAppFactory Solidity Tests", function () {
    let DefaiAppFactory;
    let DefaiToken;
    let factory;
    let defaiToken;
    let owner;
    let treasury;
    let creator;
    let user1;
    let user2;
    let addr1;

    const PLATFORM_FEE_BPS = 500; // 5%
    const APP_PRICE = ethers.utils.parseEther("100");
    const MAX_SUPPLY = 10;
    const METADATA_URI = "ipfs://QmTest123";

    beforeEach(async function () {
        [owner, treasury, creator, user1, user2, addr1] = await ethers.getSigners();

        // Deploy mock DEFAI token
        const MockToken = await ethers.getContractFactory("MockERC20");
        defaiToken = await MockToken.deploy("DEFAI Token", "DEFAI", 18);
        await defaiToken.deployed();

        // Deploy DefaiAppFactory
        DefaiAppFactory = await ethers.getContractFactory("DefaiAppFactory");
        factory = await DefaiAppFactory.deploy(
            defaiToken.address,
            treasury.address,
            PLATFORM_FEE_BPS
        );
        await factory.deployed();

        // Mint tokens to users
        await defaiToken.mint(user1.address, ethers.utils.parseEther("10000"));
        await defaiToken.mint(user2.address, ethers.utils.parseEther("10000"));
        await defaiToken.mint(creator.address, ethers.utils.parseEther("10000"));

        // Approve factory to spend tokens
        await defaiToken.connect(user1).approve(factory.address, ethers.constants.MaxUint256);
        await defaiToken.connect(user2).approve(factory.address, ethers.constants.MaxUint256);
        await defaiToken.connect(creator).approve(factory.address, ethers.constants.MaxUint256);
    });

    describe("App Registration", function () {
        it("Should register a new app successfully", async function () {
            const tx = await factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, METADATA_URI);
            const receipt = await tx.wait();
            const event = receipt.events?.find(e => e.event === "AppRegistered");
            
            expect(event).to.not.be.undefined;
            expect(event.args.appId).to.equal(0);
            expect(event.args.creator).to.equal(creator.address);
            expect(event.args.price).to.equal(APP_PRICE);
            expect(event.args.maxSupply).to.equal(MAX_SUPPLY);

            const app = await factory.getApp(0);
            expect(app.creator).to.equal(creator.address);
            expect(app.price).to.equal(APP_PRICE);
            expect(app.maxSupply).to.equal(MAX_SUPPLY);
            expect(app.isActive).to.be.true;
        });

        it("Should fail with zero price", async function () {
            await expect(
                factory.connect(creator).registerApp(0, MAX_SUPPLY, METADATA_URI)
            ).to.be.revertedWith("InvalidPrice");
        });

        it("Should fail with zero max supply", async function () {
            await expect(
                factory.connect(creator).registerApp(APP_PRICE, 0, METADATA_URI)
            ).to.be.revertedWith("InvalidMaxSupply");
        });

        it("Should fail with metadata URI too long", async function () {
            const longUri = "ipfs://" + "Q".repeat(150);
            await expect(
                factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, longUri)
            ).to.be.revertedWith("MetadataUriTooLong");
        });
    });

    describe("App Purchasing", function () {
        beforeEach(async function () {
            await factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, METADATA_URI);
        });

        it("Should purchase app successfully", async function () {
            const initialUserBalance = await defaiToken.balanceOf(user1.address);
            const initialCreatorBalance = await defaiToken.balanceOf(creator.address);
            const initialTreasuryBalance = await defaiToken.balanceOf(treasury.address);

            await expect(factory.connect(user1).purchaseAppAccess(0))
                .to.emit(factory, "AppPurchased");

            const platformFee = APP_PRICE.mul(PLATFORM_FEE_BPS).div(10000);
            const creatorAmount = APP_PRICE.sub(platformFee);

            expect(await defaiToken.balanceOf(user1.address)).to.equal(
                initialUserBalance.sub(APP_PRICE)
            );
            expect(await defaiToken.balanceOf(creator.address)).to.equal(
                initialCreatorBalance.add(creatorAmount)
            );
            expect(await defaiToken.balanceOf(treasury.address)).to.equal(
                initialTreasuryBalance.add(platformFee)
            );

            expect(await factory.hasAccess(user1.address, 0)).to.be.true;
        });

        it("Should fail to purchase non-existent app", async function () {
            await expect(
                factory.connect(user1).purchaseAppAccess(999)
            ).to.be.revertedWith("AppDoesNotExist");
        });

        it("Should fail to purchase same app twice", async function () {
            await factory.connect(user1).purchaseAppAccess(0);
            await expect(
                factory.connect(user1).purchaseAppAccess(0)
            ).to.be.revertedWith("AlreadyOwnsApp");
        });

        it("Should handle batch purchases", async function () {
            await factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, "ipfs://QmTest2");
            await factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, "ipfs://QmTest3");

            await factory.connect(user1).batchPurchaseApps([0, 1, 2]);

            expect(await factory.hasAccess(user1.address, 0)).to.be.true;
            expect(await factory.hasAccess(user1.address, 1)).to.be.true;
            expect(await factory.hasAccess(user1.address, 2)).to.be.true;
        });
    });

    describe("Review System", function () {
        beforeEach(async function () {
            await factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, METADATA_URI);
            await factory.connect(user1).purchaseAppAccess(0);
        });

        it("Should submit review successfully", async function () {
            const tx = await factory.connect(user1).submitReview(0, 5, "QmReviewCID");
            const receipt = await tx.wait();
            const event = receipt.events?.find(e => e.event === "ReviewSubmitted");
            
            expect(event).to.not.be.undefined;
            expect(event.args.appId).to.equal(0);
            expect(event.args.reviewer).to.equal(user1.address);
            expect(event.args.rating).to.equal(5);
            expect(event.args.commentCid).to.equal("QmReviewCID");

            const avgRating = await factory.getAppAverageRating(0);
            expect(avgRating).to.equal(500); // 5 * 100
        });

        it("Should fail to review without owning app", async function () {
            await expect(
                factory.connect(user2).submitReview(0, 5, "QmReviewCID")
            ).to.be.revertedWith("MustOwnAppToReview");
        });

        it("Should fail with invalid rating", async function () {
            await expect(
                factory.connect(user1).submitReview(0, 6, "QmReviewCID")
            ).to.be.revertedWith("InvalidRating");
        });

        it("Should update review", async function () {
            await factory.connect(user1).submitReview(0, 3, "QmReviewCID1");
            const tx = await factory.connect(user1).updateReview(0, 5, "QmReviewCID2");
            const receipt = await tx.wait();
            const event = receipt.events?.find(e => e.event === "ReviewUpdated");
            
            expect(event).to.not.be.undefined;
            expect(event.args.appId).to.equal(0);
            expect(event.args.reviewer).to.equal(user1.address);
            expect(event.args.newRating).to.equal(5);
            expect(event.args.newCommentCid).to.equal("QmReviewCID2");

            const avgRating = await factory.getAppAverageRating(0);
            expect(avgRating).to.equal(500); // Updated to 5 * 100
        });
    });

    describe("Admin Functions", function () {
        it("Should update platform settings", async function () {
            const newTreasury = addr1.address;
            const newFeeBps = 1000; // 10%

            const tx = await factory.connect(owner).updatePlatformSettings(newFeeBps, newTreasury);
            const receipt = await tx.wait();
            const event = receipt.events?.find(e => e.event === "PlatformSettingsUpdated");
            
            expect(event).to.not.be.undefined;
            expect(event.args.platformFeeBps).to.equal(newFeeBps);
            expect(event.args.treasury).to.equal(newTreasury);

            expect(await factory.platformFeeBps()).to.equal(newFeeBps);
            expect(await factory.treasury()).to.equal(newTreasury);
        });

        it("Should fail to update settings by non-owner", async function () {
            await expect(
                factory.connect(user1).updatePlatformSettings(1000, addr1.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should pause and unpause contract", async function () {
            await factory.connect(owner).pause();
            
            await expect(
                factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, METADATA_URI)
            ).to.be.revertedWith("Pausable: paused");

            await factory.connect(owner).unpause();

            await expect(factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, METADATA_URI))
                .to.emit(factory, "AppRegistered");
        });
    });

    describe("Refund Functionality", function () {
        beforeEach(async function () {
            await factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, METADATA_URI);
            await factory.connect(user1).purchaseAppAccess(0);
        });

        it("Should process refund successfully", async function () {
            const userBalanceBefore = await defaiToken.balanceOf(user1.address);
            
            const tx = await factory.connect(creator).refundPurchase(0, user1.address, "Quality issue");
            const receipt = await tx.wait();
            const event = receipt.events?.find(e => e.event === "PurchaseRefunded");
            
            expect(event).to.not.be.undefined;
            expect(event.args.appId).to.equal(0);
            expect(event.args.user).to.equal(user1.address);
            expect(event.args.refundAmount).to.equal(APP_PRICE);
            expect(event.args.reason).to.equal("Quality issue");

            expect(await defaiToken.balanceOf(user1.address)).to.equal(
                userBalanceBefore.add(APP_PRICE)
            );
            expect(await factory.hasAccess(user1.address, 0)).to.be.false;
        });

        it("Should fail refund by non-creator", async function () {
            await expect(
                factory.connect(user2).refundPurchase(0, user1.address, "Quality issue")
            ).to.be.revertedWith("UnauthorizedCreator");
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await factory.connect(creator).registerApp(APP_PRICE, MAX_SUPPLY, METADATA_URI);
            await factory.connect(creator).registerApp(APP_PRICE.mul(2), MAX_SUPPLY * 2, "ipfs://QmTest2");
        });

        it("Should get total apps", async function () {
            expect(await factory.totalApps()).to.equal(2);
        });

        it("Should get creator apps", async function () {
            const creatorApps = await factory.getCreatorApps(creator.address);
            expect(creatorApps.length).to.equal(2);
            expect(creatorApps[0]).to.equal(0);
            expect(creatorApps[1]).to.equal(1);
        });

        it("Should get user purchased apps", async function () {
            await factory.connect(user1).purchaseAppAccess(0);
            await factory.connect(user1).purchaseAppAccess(1);

            const userApps = await factory.getUserPurchasedApps(user1.address);
            expect(userApps.length).to.equal(2);
            expect(userApps[0]).to.equal(0);
            expect(userApps[1]).to.equal(1);
        });
    });
});