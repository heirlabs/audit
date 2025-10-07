const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DefAIEstate", function () {
    let defaiEstate;
    let tokenVault;
    let emergencyManager;
    let owner;
    let addr1;
    let addr2;
    let aiAgent;
    let beneficiary1;
    let beneficiary2;

    const ESTATE_FEE = ethers.utils.parseEther("0.1");
    const RWA_FEE = ethers.utils.parseEther("0.01");
    const MIN_INACTIVITY_PERIOD = 24 * 60 * 60; // 24 hours
    const MIN_GRACE_PERIOD = 24 * 60 * 60; // 24 hours

    beforeEach(async function () {
        [owner, addr1, addr2, aiAgent, beneficiary1, beneficiary2] = await ethers.getSigners();

        // Deploy main contract
        const DefAIEstate = await ethers.getContractFactory("DefAIEstate");
        defaiEstate = await DefAIEstate.deploy();
        await defaiEstate.deployed();

        // Deploy TokenVault
        const TokenVault = await ethers.getContractFactory("TokenVault");
        tokenVault = await TokenVault.deploy(defaiEstate.address);
        await tokenVault.deployed();

        // Deploy EmergencyManager
        const EmergencyManager = await ethers.getContractFactory("EmergencyManager");
        emergencyManager = await EmergencyManager.deploy(defaiEstate.address);
        await emergencyManager.deployed();
    });

    describe("Estate Creation", function () {
        it("Should create an estate with correct parameters", async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30; // 30 days
            const gracePeriod = MIN_GRACE_PERIOD * 7; // 7 days
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await expect(
                defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                    value: ESTATE_FEE
                })
            ).to.emit(defaiEstate, "EstateCreated")
                .withArgs(0, owner.address, 0, inactivityPeriod, gracePeriod, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

            const estate = await defaiEstate.getEstate(0);
            expect(estate.owner).to.equal(owner.address);
            expect(estate.inactivityPeriod).to.equal(inactivityPeriod);
            expect(estate.gracePeriod).to.equal(gracePeriod);
            expect(estate.ownerEmailHash).to.equal(emailHash);
        });

        it("Should fail with insufficient estate fee", async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await expect(
                defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                    value: ethers.utils.parseEther("0.05")
                })
            ).to.be.revertedWith("Insufficient estate fee");
        });

        it("Should mint estate tokens to owner", async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                value: ESTATE_FEE
            });

            const balance = await defaiEstate.balanceOf(owner.address);
            expect(balance).to.equal(ethers.utils.parseEther("1000000"));
        });
    });

    describe("Beneficiary Management", function () {
        let estateId;

        beforeEach(async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                value: ESTATE_FEE
            });
            estateId = 0;
        });

        it("Should add beneficiaries correctly", async function () {
            const beneficiaries = [
                {
                    wallet: beneficiary1.address,
                    share: 60,
                    name: "Beneficiary One",
                    relationship: "Child",
                    emailHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ben1@example.com"))
                },
                {
                    wallet: beneficiary2.address,
                    share: 40,
                    name: "Beneficiary Two",
                    relationship: "Spouse",
                    emailHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ben2@example.com"))
                }
            ];

            await defaiEstate.updateBeneficiaries(estateId, beneficiaries);

            const estate = await defaiEstate.getEstate(estateId);
            expect(estate.totalBeneficiaries).to.equal(2);
        });

        it("Should fail if shares don't sum to 100%", async function () {
            const beneficiaries = [
                {
                    wallet: beneficiary1.address,
                    share: 50,
                    name: "Beneficiary One",
                    relationship: "Child",
                    emailHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ben1@example.com"))
                },
                {
                    wallet: beneficiary2.address,
                    share: 30,
                    name: "Beneficiary Two",
                    relationship: "Spouse",
                    emailHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ben2@example.com"))
                }
            ];

            await expect(
                defaiEstate.updateBeneficiaries(estateId, beneficiaries)
            ).to.be.revertedWith("Shares must sum to 100%");
        });

        it("Should fail if too many beneficiaries", async function () {
            const beneficiaries = [];
            for (let i = 0; i < 11; i++) {
                beneficiaries.push({
                    wallet: ethers.Wallet.createRandom().address,
                    share: i === 0 ? 10 : 9,
                    name: `Beneficiary ${i}`,
                    relationship: "Relative",
                    emailHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`ben${i}@example.com`))
                });
            }

            await expect(
                defaiEstate.updateBeneficiaries(estateId, beneficiaries)
            ).to.be.revertedWith("Too many beneficiaries");
        });
    });

    describe("RWA Management", function () {
        let estateId;

        beforeEach(async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                value: ESTATE_FEE
            });
            estateId = 0;
        });

        it("Should create RWA correctly", async function () {
            const assetType = "Real Estate";
            const description = "3-bedroom house in California";
            const value = ethers.utils.parseEther("500");
            const documentHash = "QmXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

            await expect(
                defaiEstate.createRWA(estateId, assetType, description, value, documentHash, {
                    value: RWA_FEE
                })
            ).to.emit(defaiEstate, "RWAAdded");

            const estate = await defaiEstate.getEstate(estateId);
            expect(estate.totalRWAs).to.equal(1);
            expect(estate.estateValue).to.equal(value);
        });

        it("Should delete RWA correctly", async function () {
            const assetType = "Vehicle";
            const description = "Tesla Model S";
            const value = ethers.utils.parseEther("100");
            const documentHash = "QmYyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy";

            await defaiEstate.createRWA(estateId, assetType, description, value, documentHash, {
                value: RWA_FEE
            });

            await expect(defaiEstate.deleteRWA(0, estateId))
                .to.emit(defaiEstate, "RWADeleted");

            const estate = await defaiEstate.getEstate(estateId);
            expect(estate.totalRWAs).to.equal(0);
            expect(estate.estateValue).to.equal(0);
        });
    });

    describe("Trading Functions", function () {
        let estateId;

        beforeEach(async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                value: ESTATE_FEE
            });
            estateId = 0;
        });

        it("Should enable trading correctly", async function () {
            const humanShare = 70;
            const strategy = 1; // Balanced
            const stopLoss = 10;
            const emergencyDelayHours = 48;

            await expect(
                defaiEstate.enableTrading(
                    estateId,
                    aiAgent.address,
                    humanShare,
                    strategy,
                    stopLoss,
                    emergencyDelayHours
                )
            ).to.emit(defaiEstate, "TradingEnabled");

            const estate = await defaiEstate.getEstate(estateId);
            expect(estate.tradingEnabled).to.be.true;
            expect(estate.aiAgent).to.equal(aiAgent.address);
            expect(estate.humanShare).to.equal(humanShare);
            expect(estate.aiShare).to.equal(30);
        });

        it("Should contribute to trading", async function () {
            // Enable trading first
            await defaiEstate.enableTrading(estateId, aiAgent.address, 60, 1, 10, 48);

            const contributionAmount = ethers.utils.parseEther("1");
            await expect(
                defaiEstate.contributeToTrading(estateId, { value: contributionAmount })
            ).to.emit(defaiEstate, "TradingContribution");

            const estate = await defaiEstate.getEstate(estateId);
            expect(estate.humanContribution).to.equal(contributionAmount);
            expect(estate.tradingValue).to.equal(contributionAmount);
        });

        it("Should pause and resume trading", async function () {
            await defaiEstate.enableTrading(estateId, aiAgent.address, 60, 1, 10, 48);

            await expect(defaiEstate.pauseTrading(estateId))
                .to.emit(defaiEstate, "TradingPaused");

            let estate = await defaiEstate.getEstate(estateId);
            expect(estate.tradingEnabled).to.be.false;

            await expect(defaiEstate.resumeTrading(estateId))
                .to.emit(defaiEstate, "TradingResumed");

            estate = await defaiEstate.getEstate(estateId);
            expect(estate.tradingEnabled).to.be.true;
        });
    });

    describe("Inheritance", function () {
        let estateId;

        beforeEach(async function () {
            const inactivityPeriod = 1; // 1 second for testing
            const gracePeriod = 1; // 1 second for testing
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                value: ESTATE_FEE
            });
            estateId = 0;

            // Add beneficiaries
            const beneficiaries = [
                {
                    wallet: beneficiary1.address,
                    share: 60,
                    name: "Beneficiary One",
                    relationship: "Child",
                    emailHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ben1@example.com"))
                },
                {
                    wallet: beneficiary2.address,
                    share: 40,
                    name: "Beneficiary Two",
                    relationship: "Spouse",
                    emailHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ben2@example.com"))
                }
            ];
            await defaiEstate.updateBeneficiaries(estateId, beneficiaries);
        });

        it("Should trigger inheritance after inactivity period", async function () {
            // Wait for inactivity + grace period
            await ethers.provider.send("evm_increaseTime", [3]);
            await ethers.provider.send("evm_mine");

            await expect(defaiEstate.triggerInheritance(estateId))
                .to.emit(defaiEstate, "EstateLocked");

            const estate = await defaiEstate.getEstate(estateId);
            expect(estate.isClaimable).to.be.true;
        });

        it("Should not trigger inheritance before inactivity period", async function () {
            await expect(defaiEstate.triggerInheritance(estateId))
                .to.be.revertedWith("Not yet claimable");
        });
    });

    describe("Multisig Functions", function () {
        it("Should initialize multisig correctly", async function () {
            const signers = [owner.address, addr1.address, addr2.address];
            const threshold = 2;

            await expect(defaiEstate.initializeMultisig(signers, threshold))
                .to.emit(defaiEstate, "MultisigCreated");

            const multisig = await defaiEstate.getMultisig(owner.address);
            expect(multisig.signers.length).to.equal(3);
            expect(multisig.threshold).to.equal(threshold);
        });

        it("Should create and approve proposals", async function () {
            // Initialize multisig
            const signers = [owner.address, addr1.address, addr2.address];
            await defaiEstate.initializeMultisig(signers, 2);

            // Create proposal
            const targetEstate = 0;
            const action = 0; // EmergencyLock
            const data = "0x";

            await expect(defaiEstate.createProposal(targetEstate, action, data))
                .to.emit(defaiEstate, "ProposalCreated");

            // Approve proposal from another signer
            await expect(defaiEstate.connect(addr1).approveProposal(0))
                .to.emit(defaiEstate, "ProposalApproved");
        });
    });

    describe("Emergency Functions", function () {
        let estateId;

        beforeEach(async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                value: ESTATE_FEE
            });
            estateId = 0;
        });

        it("Should initiate emergency lock", async function () {
            const lockType = 0; // SecurityBreach
            const reason = "Suspicious activity detected";

            await expect(
                emergencyManager.initiateEmergencyLock(estateId, lockType, reason)
            ).to.emit(emergencyManager, "EmergencyLockInitiated");

            const isLocked = await emergencyManager.isLocked(estateId);
            expect(isLocked).to.be.true;
        });

        it("Should add and remove guardians", async function () {
            await expect(emergencyManager.addGuardian(estateId, addr1.address))
                .to.emit(emergencyManager, "GuardianAdded");

            const guardians = await emergencyManager.getEstateGuardians(estateId);
            expect(guardians).to.include(addr1.address);

            await expect(emergencyManager.removeGuardian(estateId, addr1.address))
                .to.emit(emergencyManager, "GuardianRemoved");
        });
    });

    describe("Token Vault Functions", function () {
        let estateId;
        let mockToken;

        beforeEach(async function () {
            // Create estate
            const inactivityPeriod = 1;
            const gracePeriod = 1;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(inactivityPeriod, gracePeriod, emailHash, {
                value: ESTATE_FEE
            });
            estateId = 0;

            // Deploy mock ERC20 token
            const MockToken = await ethers.getContractFactory("ERC20");
            mockToken = await MockToken.deploy("Mock Token", "MTK");
            await mockToken.deployed();
        });

        it("Should deposit tokens to vault", async function () {
            const depositAmount = ethers.utils.parseEther("100");
            await mockToken.mint(owner.address, depositAmount);
            await mockToken.approve(tokenVault.address, depositAmount);

            await expect(tokenVault.depositTokens(estateId, mockToken.address, depositAmount))
                .to.emit(tokenVault, "TokensDeposited");

            const balance = await tokenVault.getEstateTokenBalance(estateId, mockToken.address);
            expect(balance).to.equal(depositAmount);
        });
    });
});