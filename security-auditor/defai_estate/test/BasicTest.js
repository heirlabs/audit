const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Basic DefAIEstate Tests", function () {
    let defaiEstate;
    let owner;
    let addr1;

    const ESTATE_FEE = ethers.utils.parseEther("0.1");
    const MIN_INACTIVITY_PERIOD = 24 * 60 * 60; // 24 hours
    const MIN_GRACE_PERIOD = 24 * 60 * 60; // 24 hours

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();

        // Deploy minimal contract for testing
        const DefAIEstate = await ethers.getContractFactory("DefAIEstateMinimal");
        defaiEstate = await DefAIEstate.deploy();
        await defaiEstate.deployed();
    });

    describe("Deployment", function () {
        it("Should deploy with correct token name and symbol", async function () {
            expect(await defaiEstate.name()).to.equal("DefAI Estate Token");
            expect(await defaiEstate.symbol()).to.equal("ESTATE");
        });

        it("Should grant admin role to deployer", async function () {
            const ADMIN_ROLE = await defaiEstate.ADMIN_ROLE();
            expect(await defaiEstate.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
        });
    });

    describe("Estate Creation", function () {
        it("Should create an estate with correct parameters", async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30; // 30 days
            const gracePeriod = MIN_GRACE_PERIOD * 7; // 7 days
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            const tx = await defaiEstate.createEstate(
                inactivityPeriod, 
                gracePeriod, 
                emailHash, 
                { value: ESTATE_FEE }
            );
            
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "EstateCreated");
            
            expect(event).to.not.be.undefined;
            expect(event.args.owner).to.equal(owner.address);
        });

        it("Should mint tokens to estate creator", async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await defaiEstate.createEstate(
                inactivityPeriod,
                gracePeriod,
                emailHash,
                { value: ESTATE_FEE }
            );

            const balance = await defaiEstate.balanceOf(owner.address);
            expect(balance).to.equal(ethers.utils.parseEther("1000000"));
        });

        it("Should fail with insufficient fee", async function () {
            const inactivityPeriod = MIN_INACTIVITY_PERIOD * 30;
            const gracePeriod = MIN_GRACE_PERIOD * 7;
            const emailHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("owner@example.com"));

            await expect(
                defaiEstate.createEstate(
                    inactivityPeriod,
                    gracePeriod,
                    emailHash,
                    { value: ethers.utils.parseEther("0.05") }
                )
            ).to.be.revertedWith("Insufficient estate fee");
        });
    });
});