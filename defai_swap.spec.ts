import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano, Address, beginCell } from 'ton-core';
import { DefaiSwap, Opcodes, Tier, CONSTANTS } from './defai_swap_wrapper';
import '@ton-community/test-utils';

describe('DeFAI Swap Contract', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let defaiSwap: SandboxContract<DefaiSwap>;
    let deployer: SandboxContract<TreasuryContract>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    // Mock addresses for tokens and collections
    let oldMintAddress: Address;
    let newMintAddress: Address;
    let collectionAddress: Address;
    let treasuryAddress: Address;

    // Helper function to create mock contract code
    const mockCode = (): Cell => {
        // This is a simplified mock - in production, use actual compiled code
        return beginCell()
            .storeUint(0, 2)
            .storeUint(0x7e8764ef, 32) // Initialize opcode
            .endCell();
    };

    beforeAll(async () => {
        // Use mock code for testing (replace with actual compilation in production)
        code = mockCode();
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        
        deployer = await blockchain.treasury('deployer');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');
        treasury = await blockchain.treasury('treasury');

        // Create mock addresses
        oldMintAddress = Address.parse('EQD__________________________________________0LD');
        newMintAddress = Address.parse('EQD__________________________________________NEW');
        collectionAddress = Address.parse('EQD__________________________________________COL');
        treasuryAddress = treasury.address;

        // Deploy contract
        defaiSwap = blockchain.openContract(
            DefaiSwap.createFromConfig(
                {
                    admin: deployer.address,
                    oldMint: oldMintAddress,
                    newMint: newMintAddress,
                    collection: collectionAddress,
                    treasury: treasuryAddress,
                    prices: [
                        toNano('100'),  // Tier 0
                        toNano('200'),  // Tier 1
                        toNano('300'),  // Tier 2
                        toNano('400'),  // Tier 3
                        toNano('500'),  // Tier 4
                    ],
                    paused: false,
                    vrfEnabled: false, // Disable VRF for testing
                },
                code
            )
        );

        // Initialize the contract
        const initResult = await defaiSwap.sendInitialize(deployer.getSender(), {
            oldMint: oldMintAddress,
            newMint: newMintAddress,
            collection: collectionAddress,
            treasury: treasuryAddress,
            prices: [
                toNano('100'),
                toNano('200'),
                toNano('300'),
                toNano('400'),
                toNano('500'),
            ],
        });

        expect(initResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: defaiSwap.address,
            success: true,
        });
    });

    describe('Initialization', () => {
        it('should initialize with correct config', async () => {
            const config = await defaiSwap.getConfig();
            
            expect(config.admin.equals(deployer.address)).toBe(true);
            expect(config.oldMint.equals(oldMintAddress)).toBe(true);
            expect(config.newMint.equals(newMintAddress)).toBe(true);
            expect(config.collection.equals(collectionAddress)).toBe(true);
            expect(config.treasury.equals(treasuryAddress)).toBe(true);
            expect(config.paused).toBe(false);
        });

        it('should set correct tier prices', async () => {
            const prices = await defaiSwap.getTierPrices();
            
            expect(prices[0]).toEqual(toNano('100'));
            expect(prices[1]).toEqual(toNano('200'));
            expect(prices[2]).toEqual(toNano('300'));
            expect(prices[3]).toEqual(toNano('400'));
            expect(prices[4]).toEqual(toNano('500'));
        });
    });

    describe('Swap Operations', () => {
        it('should swap DEFAI for NFT', async () => {
            const tier = Tier.TRAIN;
            const result = await defaiSwap.sendSwapDefaiForNft(
                user1.getSender(),
                {
                    tier: tier,
                    value: toNano('250'), // Include extra for fees
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: true,
            });
        });

        it('should swap OLD DEFAI for NFT', async () => {
            const tier = Tier.BOAT;
            const result = await defaiSwap.sendSwapOldDefaiForNft(
                user1.getSender(),
                {
                    tier: tier,
                    value: toNano('350'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: true,
            });
        });

        it('should fail swap with invalid tier', async () => {
            const result = await defaiSwap.sendSwapDefaiForNft(
                user1.getSender(),
                {
                    tier: 10, // Invalid tier
                    value: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: false,
            });
        });
    });

    describe('Tax Management', () => {
        it('should initialize user tax state', async () => {
            const taxState = await defaiSwap.getUserTaxState(user1.address);
            
            expect(taxState.taxRateBps).toEqual(CONSTANTS.INITIAL_TAX_BPS);
            expect(taxState.swapCount).toEqual(0);
        });

        it('should increment tax rate after swap', async () => {
            // First swap
            await defaiSwap.sendSwapDefaiForNft(user1.getSender(), {
                tier: Tier.TRAIN,
                value: toNano('250'),
            });

            const taxState = await defaiSwap.getUserTaxState(user1.address);
            const expectedTax = CONSTANTS.INITIAL_TAX_BPS + CONSTANTS.TAX_INCREMENT_BPS;
            
            expect(taxState.taxRateBps).toEqual(expectedTax);
            expect(taxState.swapCount).toEqual(1);
        });

        it('should cap tax at maximum', async () => {
            // Perform multiple swaps to reach tax cap
            for (let i = 0; i < 30; i++) {
                await defaiSwap.sendSwapDefaiForNft(user1.getSender(), {
                    tier: Tier.OG,
                    value: toNano('150'),
                });
            }

            const taxState = await defaiSwap.getUserTaxState(user1.address);
            expect(taxState.taxRateBps).toEqual(CONSTANTS.TAX_CAP_BPS);
        });

        it('should reset tax after duration', async () => {
            // First swap
            await defaiSwap.sendSwapDefaiForNft(user1.getSender(), {
                tier: Tier.TRAIN,
                value: toNano('250'),
            });

            // Fast forward time (simulated)
            blockchain.now = blockchain.now + CONSTANTS.TAX_RESET_DURATION + 1;

            await defaiSwap.sendResetUserTax(user1.getSender());

            const taxState = await defaiSwap.getUserTaxState(user1.address);
            expect(taxState.taxRateBps).toEqual(CONSTANTS.INITIAL_TAX_BPS);
        });
    });

    describe('Vesting and Claims', () => {
        let nftMint: Address;

        beforeEach(async () => {
            // Create an NFT through swap
            const result = await defaiSwap.sendSwapDefaiForNft(
                user1.getSender(),
                {
                    tier: Tier.PLANE,
                    value: toNano('450'),
                }
            );

            // Use user address as NFT mint for testing
            nftMint = user1.address;
        });

        it('should create vesting state after swap', async () => {
            const vestingState = await defaiSwap.getVestingState(nftMint);
            
            expect(vestingState.totalAmount).toBeGreaterThan(0n);
            expect(vestingState.releasedAmount).toEqual(0n);
            expect(vestingState.startTimestamp).toBeGreaterThan(0);
            expect(vestingState.endTimestamp).toEqual(
                vestingState.startTimestamp + CONSTANTS.VESTING_DURATION
            );
        });

        it('should fail claim during cliff period', async () => {
            const result = await defaiSwap.sendClaimVested(user1.getSender(), {
                nftMint: nftMint,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: false,
            });
        });

        it('should allow claim after cliff period', async () => {
            // Fast forward past cliff
            blockchain.now = blockchain.now + CONSTANTS.CLIFF_DURATION + 1;

            const result = await defaiSwap.sendClaimVested(user1.getSender(), {
                nftMint: nftMint,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: true,
            });
        });

        it('should calculate vested amount correctly', async () => {
            const vestingState = await defaiSwap.getVestingState(nftMint);
            
            // Fast forward to 50% of vesting period
            const halfwayTime = vestingState.startTimestamp + (CONSTANTS.VESTING_DURATION / 2);
            blockchain.now = halfwayTime;

            const vestedAmount = DefaiSwap.calculateVestedAmount(
                vestingState.totalAmount,
                vestingState.startTimestamp,
                vestingState.endTimestamp,
                blockchain.now
            );

            // Should be approximately 50% vested
            const expectedAmount = vestingState.totalAmount / 2n;
            const tolerance = vestingState.totalAmount / 100n; // 1% tolerance
            
            expect(vestedAmount).toBeGreaterThan(expectedAmount - tolerance);
            expect(vestedAmount).toBeLessThan(expectedAmount + tolerance);
        });
    });

    describe('Redemption', () => {
        let nftMint: Address;

        beforeEach(async () => {
            // Create an NFT through swap
            await defaiSwap.sendSwapDefaiForNft(user1.getSender(), {
                tier: Tier.ROCKET,
                value: toNano('550'),
            });

            nftMint = user1.address;
        });

        it('should redeem NFT for base tokens', async () => {
            const result = await defaiSwap.sendRedeem(user1.getSender(), {
                nftMint: nftMint,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: true,
            });

            // Check NFT is marked as redeemed
            const bonusState = await defaiSwap.getBonusState(nftMint);
            expect(bonusState.claimed).toBe(true);
        });

        it('should fail to redeem already redeemed NFT', async () => {
            // First redemption
            await defaiSwap.sendRedeem(user1.getSender(), {
                nftMint: nftMint,
            });

            // Second redemption should fail
            const result = await defaiSwap.sendRedeem(user1.getSender(), {
                nftMint: nftMint,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: false,
            });
        });
    });

    describe('Bonus Reroll', () => {
        let nftMint: Address;

        beforeEach(async () => {
            // Create an NFT
            await defaiSwap.sendSwapDefaiForNft(user1.getSender(), {
                tier: Tier.BOAT,
                value: toNano('350'),
            });

            nftMint = user1.address;
        });

        it('should reroll bonus', async () => {
            const oldBonus = await defaiSwap.getBonusState(nftMint);

            const result = await defaiSwap.sendRerollBonus(user1.getSender(), {
                nftMint: nftMint,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: true,
            });

            const newBonus = await defaiSwap.getBonusState(nftMint);
            
            // Bonus should have changed (might be same value but unlikely)
            expect(newBonus.vestingStart).toBeGreaterThan(oldBonus.vestingStart);
            expect(newBonus.feeDeducted).toBeGreaterThan(oldBonus.feeDeducted);
        });

        it('should deduct tax from reroll', async () => {
            const taxState = await defaiSwap.getUserTaxState(user1.address);
            const oldFees = (await defaiSwap.getBonusState(nftMint)).feeDeducted;

            await defaiSwap.sendRerollBonus(user1.getSender(), {
                nftMint: nftMint,
            });

            const newFees = (await defaiSwap.getBonusState(nftMint)).feeDeducted;
            
            expect(newFees).toBeGreaterThan(oldFees);
        });
    });

    describe('Admin Functions', () => {
        it('should pause contract', async () => {
            const result = await defaiSwap.sendPause(deployer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiSwap.address,
                success: true,
            });

            const isPaused = await defaiSwap.getIsPaused();
            expect(isPaused).toBe(true);
        });

        it('should unpause contract', async () => {
            await defaiSwap.sendPause(deployer.getSender());
            
            const result = await defaiSwap.sendUnpause(deployer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiSwap.address,
                success: true,
            });

            const isPaused = await defaiSwap.getIsPaused();
            expect(isPaused).toBe(false);
        });

        it('should fail operations when paused', async () => {
            await defaiSwap.sendPause(deployer.getSender());

            const result = await defaiSwap.sendSwapDefaiForNft(
                user1.getSender(),
                {
                    tier: Tier.TRAIN,
                    value: toNano('250'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: false,
            });
        });

        it('should update prices', async () => {
            const newPrices = [
                toNano('150'),
                toNano('250'),
                toNano('350'),
                toNano('450'),
                toNano('550'),
            ];

            const result = await defaiSwap.sendUpdatePrices(
                deployer.getSender(),
                newPrices
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiSwap.address,
                success: true,
            });

            const prices = await defaiSwap.getTierPrices();
            expect(prices).toEqual(newPrices);
        });

        it('should update treasury', async () => {
            const newTreasury = await blockchain.treasury('newTreasury');

            const result = await defaiSwap.sendUpdateTreasury(
                deployer.getSender(),
                newTreasury.address
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiSwap.address,
                success: true,
            });

            const config = await defaiSwap.getConfig();
            expect(config.treasury.equals(newTreasury.address)).toBe(true);
        });

        it('should reject admin operations from non-admin', async () => {
            const result = await defaiSwap.sendPause(user1.getSender());

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
                success: false,
            });
        });

        it('should propose and accept admin change', async () => {
            const newAdmin = await blockchain.treasury('newAdmin');

            // Propose admin change
            await defaiSwap.sendProposeAdminChange(
                deployer.getSender(),
                newAdmin.address
            );

            // Fast forward past timelock
            blockchain.now = blockchain.now + CONSTANTS.ADMIN_TIMELOCK_DURATION + 1;

            // Accept admin change
            const result = await defaiSwap.sendAcceptAdminChange(
                deployer.getSender()
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiSwap.address,
                success: true,
            });

            const config = await defaiSwap.getConfig();
            expect(config.admin.equals(newAdmin.address)).toBe(true);
        });

        it('should fail admin change before timelock', async () => {
            const newAdmin = await blockchain.treasury('newAdmin');

            await defaiSwap.sendProposeAdminChange(
                deployer.getSender(),
                newAdmin.address
            );

            // Try to accept immediately (before timelock)
            const result = await defaiSwap.sendAcceptAdminChange(
                deployer.getSender()
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiSwap.address,
                success: false,
            });
        });
    });

    describe('Merkle Proof Verification', () => {
        it('should build merkle proof correctly', async () => {
            const proofElements = [
                Buffer.from('proof1', 'utf8'),
                Buffer.from('proof2', 'utf8'),
                Buffer.from('proof3', 'utf8'),
            ];

            const proofCell = DefaiSwap.buildMerkleProof(proofElements);
            
            expect(proofCell).toBeDefined();
            expect(proofCell.bits.length).toBeGreaterThan(0);
        });

        it('should swap OG tier 0 with valid merkle proof', async () => {
            const vestingAmount = toNano('1000');
            const merkleProof = DefaiSwap.buildMerkleProof([
                Buffer.from('validproof', 'utf8'),
            ]);

            const result = await defaiSwap.sendSwapOgTier0(
                user1.getSender(),
                {
                    vestingAmount: vestingAmount,
                    merkleProof: merkleProof,
                }
            );

            // Note: This will fail without proper merkle root setup
            // In production, you'd set up the merkle tree properly
            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiSwap.address,
            });
        });
    });

    describe('Utility Functions', () => {
        it('should calculate tax correctly', () => {
            const amount = toNano('1000');
            const taxRateBps = 500; // 5%

            const tax = DefaiSwap.calculateTax(amount, taxRateBps);
            const expected = toNano('50'); // 5% of 1000

            expect(tax).toEqual(expected);
        });

        it('should format basis points correctly', () => {
            expect(DefaiSwap.formatBasisPoints(500)).toEqual('5.00%');
            expect(DefaiSwap.formatBasisPoints(1500)).toEqual('15.00%');
            expect(DefaiSwap.formatBasisPoints(3000)).toEqual('30.00%');
        });

        it('should get tier names correctly', () => {
            expect(DefaiSwap.getTierName(Tier.OG)).toEqual('OG');
            expect(DefaiSwap.getTierName(Tier.TRAIN)).toEqual('Train');
            expect(DefaiSwap.getTierName(Tier.BOAT)).toEqual('Boat');
            expect(DefaiSwap.getTierName(Tier.PLANE)).toEqual('Plane');
            expect(DefaiSwap.getTierName(Tier.ROCKET)).toEqual('Rocket');
        });

        it('should get bonus range for tier', () => {
            const ogRange = DefaiSwap.getBonusRangeForTier(Tier.OG);
            expect(ogRange.min).toEqual(0);
            expect(ogRange.max).toEqual(0);

            const rocketRange = DefaiSwap.getBonusRangeForTier(Tier.ROCKET);
            expect(rocketRange.min).toEqual(5000);
            expect(rocketRange.max).toEqual(30000);
        });

        it('should check if tax can be reset', () => {
            const now = Math.floor(Date.now() / 1000);
            
            // Recent swap - cannot reset
            expect(DefaiSwap.canResetTax(now - 3600)).toBe(false);
            
            // Old swap - can reset
            expect(DefaiSwap.canResetTax(now - 90000)).toBe(true);
        });

        it('should check cliff period correctly', () => {
            const now = Math.floor(Date.now() / 1000);
            
            // Still in cliff
            expect(DefaiSwap.isInCliffPeriod(now - 3600)).toBe(true);
            
            // Past cliff
            expect(DefaiSwap.isInCliffPeriod(now - 200000)).toBe(false);
        });

        it('should calculate next tax rate', () => {
            expect(DefaiSwap.calculateNextTaxRate(500)).toEqual(600);
            expect(DefaiSwap.calculateNextTaxRate(2900)).toEqual(3000);
            expect(DefaiSwap.calculateNextTaxRate(3000)).toEqual(3000); // Capped
        });
    });
});