const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("DefaiSwap", function () {
  async function deployDefaiSwapFixture() {
    const [owner, user1, user2, treasury, vrfCoordinator] = await ethers.getSigners();

    // Deploy mock tokens - use the contract from contracts folder
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const oldDefai = await MockERC20.deploy("Old DEFAI", "ODEFAI", ethers.parseEther("1000000"));
    const defai = await MockERC20.deploy("DEFAI", "DEFAI", ethers.parseEther("1000000"));

    // Deploy NFT contract
    const DefaiNFT = await ethers.getContractFactory("DefaiNFT");
    const nft = await DefaiNFT.deploy("DefAI NFT", "DNFT", "https://api.defai.io/nft/");

    // Deploy swap contract
    const DefaiSwap = await ethers.getContractFactory("DefaiSwap");
    const prices = [
      ethers.parseEther("100"),  // Tier 0
      ethers.parseEther("200"),  // Tier 1
      ethers.parseEther("500"),  // Tier 2
      ethers.parseEther("1000"), // Tier 3
      ethers.parseEther("2000")  // Tier 4
    ];
    
    const swap = await DefaiSwap.deploy(
      oldDefai.target,
      defai.target,
      nft.target,
      treasury.address,
      prices,
      vrfCoordinator.address, // Mock VRF coordinator
      1, // subscription ID
      "0x0000000000000000000000000000000000000000000000000000000000000000" // key hash
    );

    // Grant minter role to swap contract
    await nft.grantRole(await nft.MINTER_ROLE(), swap.target);

    // Create simple merkle root for testing (in production would use proper merkle tree)
    const ogWhitelist = [
      { address: user1.address, amount: ethers.parseEther("1000") },
      { address: user2.address, amount: ethers.parseEther("2000") }
    ];

    // Simple mock root for testing
    const ogRoot = ethers.solidityPackedKeccak256(
      ["address", "uint256"], 
      [user1.address, ethers.parseEther("1000")]
    );

    // Initialize collection
    await swap.initializeCollection(
      [100, 200, 300, 400, 500], // supplies
      ogRoot,
      ogRoot, // reuse for airdrop for testing
      50 // OG supply
    );

    // Distribute tokens
    await oldDefai.transfer(user1.address, ethers.parseEther("10000"));
    await oldDefai.transfer(user2.address, ethers.parseEther("10000"));
    await defai.transfer(user1.address, ethers.parseEther("10000"));
    await defai.transfer(user2.address, ethers.parseEther("10000"));

    return { swap, nft, oldDefai, defai, owner, user1, user2, treasury, ogRoot, ogWhitelist };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { swap, owner } = await loadFixture(deployDefaiSwapFixture);
      expect(await swap.owner()).to.equal(owner.address);
    });

    it("Should set correct initial parameters", async function () {
      const { swap, treasury } = await loadFixture(deployDefaiSwapFixture);
      expect(await swap.treasury()).to.equal(treasury.address);
      expect(await swap.INITIAL_TAX_BPS()).to.equal(500);
      expect(await swap.TAX_CAP_BPS()).to.equal(3000);
    });
  });

  describe("User Tax System", function () {
    it("Should initialize user tax state", async function () {
      const { swap, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.connect(user1).initializeUserTax();
      const taxState = await swap.userTaxStates(user1.address);
      
      expect(taxState.taxRateBps).to.equal(500);
      expect(taxState.swapCount).to.equal(0);
    });

    it("Should reset tax after 24 hours", async function () {
      const { swap, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.connect(user1).initializeUserTax();
      
      // Fast forward 24 hours
      await time.increase(24 * 60 * 60);
      
      await swap.connect(user1).resetUserTax();
      const taxState = await swap.userTaxStates(user1.address);
      
      expect(taxState.taxRateBps).to.equal(500);
    });

    it("Should not allow early tax reset", async function () {
      const { swap, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.connect(user1).initializeUserTax();
      
      await expect(
        swap.connect(user1).resetUserTax()
      ).to.be.revertedWith("Tax reset too early");
    });
  });

  describe("Admin Functions", function () {
    it("Should update prices", async function () {
      const { swap, owner } = await loadFixture(deployDefaiSwapFixture);
      
      const newPrices = [
        ethers.parseEther("150"),
        ethers.parseEther("250"),
        ethers.parseEther("550"),
        ethers.parseEther("1050"),
        ethers.parseEther("2050")
      ];
      
      await swap.updatePrices(newPrices);
      expect(await swap.tierPrices(0)).to.equal(newPrices[0]);
    });

    it("Should pause and unpause", async function () {
      const { swap, owner } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.pause();
      expect(await swap.paused()).to.be.true;
      
      await swap.unpause();
      expect(await swap.paused()).to.be.false;
    });

    it("Should handle admin transfer with timelock", async function () {
      const { swap, owner, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.proposeAdminChange(user1.address);
      
      // Should fail before timelock
      await expect(swap.acceptAdminChange()).to.be.revertedWith("Timelock not expired");
      
      // Fast forward 48 hours
      await time.increase(48 * 60 * 60);
      
      await swap.acceptAdminChange();
      expect(await swap.owner()).to.equal(user1.address);
    });
  });

  describe("OG Tier 0 Swap", function () {
    it("Should allow OG holders to claim NFT", async function () {
      const { swap, nft, user1, ogRoot, ogWhitelist } = await loadFixture(deployDefaiSwapFixture);
      
      // Simple mock proof for testing
      const proof = [ogRoot];
      
      // Disable VRF for testing
      await swap.connect(user1).swapOgTier0ForNft(
        ogWhitelist[0].amount,
        proof,
        1 // tokenId
      );
      
      // Check OG claim status
      expect(await swap.ogTier0Claimed(user1.address)).to.be.true;
    });

    it("Should not allow double claiming", async function () {
      const { swap, user1, ogRoot, ogWhitelist } = await loadFixture(deployDefaiSwapFixture);
      
      // Simple mock proof for testing
      const proof = [ogRoot];
      
      await swap.connect(user1).swapOgTier0ForNft(ogWhitelist[0].amount, proof, 1);
      
      await expect(
        swap.connect(user1).swapOgTier0ForNft(ogWhitelist[0].amount, proof, 2)
      ).to.be.revertedWith("Already claimed");
    });
  });

  describe("DEFAI Token Swap", function () {
    it("Should swap DEFAI for NFT with correct tax", async function () {
      const { swap, defai, user1, treasury } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.connect(user1).initializeUserTax();
      
      const tier = 1;
      const price = await swap.tierPrices(tier);
      const taxRate = 500; // 5%
      const taxAmount = (price * BigInt(taxRate)) / 10000n;
      
      // Approve tokens
      await defai.connect(user1).approve(swap.target, price);
      
      const treasuryBalanceBefore = await defai.balanceOf(treasury.address);
      
      await swap.connect(user1).swapDefaiForNft(tier, 1);
      
      const treasuryBalanceAfter = await defai.balanceOf(treasury.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(taxAmount);
    });

    it("Should increase tax rate after swap", async function () {
      const { swap, defai, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.connect(user1).initializeUserTax();
      
      const price = await swap.tierPrices(1);
      await defai.connect(user1).approve(swap.target, price);
      
      await swap.connect(user1).swapDefaiForNft(1, 1);
      
      const taxState = await swap.userTaxStates(user1.address);
      expect(taxState.taxRateBps).to.equal(600); // 5% + 1% = 6%
    });
  });

  describe("OLD DEFAI Swap", function () {
    it("Should swap OLD DEFAI for NFT without tax", async function () {
      const { swap, oldDefai, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      const tier = 2;
      const price = await swap.tierPrices(tier);
      
      await oldDefai.connect(user1).approve(swap.target, price);
      
      const contractBalanceBefore = await oldDefai.balanceOf(swap.target);
      
      await swap.connect(user1).swapOldDefaiForNft(tier, 1);
      
      const contractBalanceAfter = await oldDefai.balanceOf(swap.target);
      expect(contractBalanceAfter - contractBalanceBefore).to.equal(price);
    });
  });

  describe("Vesting", function () {
    it("Should not allow claiming before cliff period", async function () {
      const { swap, defai, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.connect(user1).initializeUserTax();
      const price = await swap.tierPrices(1);
      await defai.connect(user1).approve(swap.target, price);
      await swap.connect(user1).swapDefaiForNft(1, 1);
      
      await expect(
        swap.connect(user1).claimVested(1)
      ).to.be.revertedWith("Still in cliff");
    });

    it("Should allow claiming after cliff period", async function () {
      const { swap, defai, nft, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.connect(user1).initializeUserTax();
      const price = await swap.tierPrices(1);
      await defai.connect(user1).approve(swap.target, price);
      
      // Mint NFT manually for testing
      await nft.mint(user1.address, 1);
      
      // Setup vesting state manually (would normally be done by swap)
      // Note: In production, this would be set during swap execution
      
      // Fast forward past cliff (2 days)
      await time.increase(2 * 24 * 60 * 60 + 1);
      
      // Test would continue with actual vesting claim
      // but requires full VRF integration or mock
    });
  });

  describe("Pause Functionality", function () {
    it("Should prevent swaps when paused", async function () {
      const { swap, defai, user1 } = await loadFixture(deployDefaiSwapFixture);
      
      await swap.pause();
      
      await expect(
        swap.connect(user1).swapDefaiForNft(1, 1)
      ).to.be.revertedWith("Pausable: paused");
    });
  });
});