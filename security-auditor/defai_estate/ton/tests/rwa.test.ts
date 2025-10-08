import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, beginCell, Address } from '@ton/core';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';
import { extendContract, toNano } from './test-helpers';

describe('DefAI RWA Contract', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let rwaContract: SandboxContract<any>;
    let treasuryAddress: Address;
    let rwaCode: Cell;

    const RWA_TYPES = {
        REAL_ESTATE: 1,
        VEHICLE: 2,
        COLLECTIBLE: 3,
        FINANCIAL: 4,
        INTELLECTUAL: 5,
        OTHER: 6,
    };

    const RWA_STATUS = {
        PENDING: 0,
        VERIFIED: 1,
        DISPUTED: 2,
        TRANSFERRED: 3,
        CLAIMED: 4,
    };

    beforeAll(async () => {
        rwaCode = await compile('defai-rwa');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        
        // Deploy a mock treasury
        const treasury = await blockchain.treasury('treasury');
        treasuryAddress = treasury.address;
    });

    async function deployRWA() {
        const rwaData = beginCell()
            .storeDict(null) // rwa_registry
            .storeDict(null) // estate_rwas
            .storeUint(0, 64) // rwa_counter
            .storeAddress(deployer.address) // verifier
            .storeAddress(treasuryAddress) // treasury
            .storeCoins(0) // total_value_locked
            .endCell();

        rwaContract = extendContract(blockchain.openContract({
            code: rwaCode,
            data: rwaData,
            address: deployer.address,
        }));

        const deployResult = await rwaContract.sendDeploy(
            deployer.getSender(),
            toNano('0.5')
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: rwaContract.address,
            deploy: true,
            success: true,
        });

        return rwaContract;
    }

    describe('RWA Registration', () => {
        it('should register RWA with valid parameters', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const estateId = 12345;
            const metadataHash = BigInt('0x' + '1'.repeat(64));

            const registerResult = await rwa.sendRegisterRWA(
                owner.getSender(),
                estateId,
                RWA_TYPES.REAL_ESTATE,
                toNano('100'), // 100 TON value
                metadataHash,
                toNano('0.01') // Registration fee
            );

            expect(registerResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: true,
                value: toNano('0.01'),
            });

            // Check fee was sent to treasury
            expect(registerResult.transactions).toHaveTransaction({
                from: rwa.address,
                to: treasuryAddress,
                value: toNano('0.01'),
            });

            const stats = await rwa.getRegistryStats();
            expect(stats.rwa_counter).toBe(1);
        });

        it('should reject invalid RWA type', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            const registerResult = await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                99, // Invalid type
                toNano('100'),
                BigInt('0x' + '1'.repeat(64)),
                toNano('0.01')
            );

            expect(registerResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: false,
                exitCode: 610, // error::invalid_rwa_type
            });
        });

        it('should reject insufficient registration fee', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            const registerResult = await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.VEHICLE,
                toNano('50'),
                BigInt('0x' + '2'.repeat(64)),
                toNano('0.005') // Less than 0.01 TON required
            );

            expect(registerResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: false,
                exitCode: 611, // error::insufficient_fee
            });
        });

        it('should reject value below minimum', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            const registerResult = await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.COLLECTIBLE,
                toNano('0.0005'), // Below 0.001 TON minimum
                BigInt('0x' + '3'.repeat(64)),
                toNano('0.01')
            );

            expect(registerResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: false,
                exitCode: 603, // error::invalid_value
            });
        });
    });

    describe('RWA Verification', () => {
        it('should verify RWA by authorized verifier', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            // Register RWA first
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.REAL_ESTATE,
                toNano('100'),
                BigInt('0x' + '4'.repeat(64)),
                toNano('0.01')
            );

            // Verify as deployer (who is the verifier)
            const verifyResult = await rwa.sendVerifyRWA(
                deployer.getSender(),
                0 // rwa_id
            );

            expect(verifyResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: rwa.address,
                success: true,
            });

            const info = await rwa.getRWAInfo(0);
            expect(info.status).toBe(RWA_STATUS.VERIFIED);

            const stats = await rwa.getRegistryStats();
            expect(stats.total_value_locked).toBeGreaterThanOrEqual(toNano('100'));
        });

        it('should reject verification from non-verifier', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const nonVerifier = await blockchain.treasury('nonVerifier');

            // Register RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.VEHICLE,
                toNano('50'),
                BigInt('0x' + '5'.repeat(64)),
                toNano('0.01')
            );

            // Try to verify as non-verifier
            const verifyResult = await rwa.sendVerifyRWA(
                nonVerifier.getSender(),
                0
            );

            expect(verifyResult.transactions).toHaveTransaction({
                from: nonVerifier.address,
                to: rwa.address,
                success: false,
                exitCode: 601, // error::unauthorized
            });
        });

        it('should reject verifying already verified RWA', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            // Register and verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.FINANCIAL,
                toNano('200'),
                BigInt('0x' + '6'.repeat(64)),
                toNano('0.01')
            );

            await rwa.sendVerifyRWA(deployer.getSender(), 0);

            // Try to verify again
            const secondVerifyResult = await rwa.sendVerifyRWA(
                deployer.getSender(),
                0
            );

            expect(secondVerifyResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: rwa.address,
                success: false,
                exitCode: 605, // error::already_verified
            });
        });
    });

    describe('RWA Value Updates', () => {
        it('should update RWA value by owner', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            // Register and verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.REAL_ESTATE,
                toNano('100'),
                BigInt('0x' + '7'.repeat(64)),
                toNano('0.01')
            );

            await rwa.sendVerifyRWA(deployer.getSender(), 0);

            // Update value
            const updateResult = await rwa.sendUpdateRWAValue(
                owner.getSender(),
                0,
                toNano('150') // New value
            );

            expect(updateResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: true,
            });

            const info = await rwa.getRWAInfo(0);
            expect(info.value).toBe(toNano('150'));
        });

        it('should update RWA value by verifier', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            // Register and verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.COLLECTIBLE,
                toNano('50'),
                BigInt('0x' + '8'.repeat(64)),
                toNano('0.01')
            );

            await rwa.sendVerifyRWA(deployer.getSender(), 0);

            // Update value as verifier
            const updateResult = await rwa.sendUpdateRWAValue(
                deployer.getSender(),
                0,
                toNano('75')
            );

            expect(updateResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: rwa.address,
                success: true,
            });
        });

        it('should reject value update from unauthorized user', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const unauthorized = await blockchain.treasury('unauthorized');

            // Register and verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.VEHICLE,
                toNano('30'),
                BigInt('0x' + '9'.repeat(64)),
                toNano('0.01')
            );

            await rwa.sendVerifyRWA(deployer.getSender(), 0);

            // Try to update as unauthorized user
            const updateResult = await rwa.sendUpdateRWAValue(
                unauthorized.getSender(),
                0,
                toNano('40')
            );

            expect(updateResult.transactions).toHaveTransaction({
                from: unauthorized.address,
                to: rwa.address,
                success: false,
                exitCode: 601, // error::unauthorized
            });
        });

        it('should reject updating unverified RWA', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            // Register but don't verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.OTHER,
                toNano('20'),
                BigInt('0x' + 'a'.repeat(64)),
                toNano('0.01')
            );

            // Try to update unverified RWA
            const updateResult = await rwa.sendUpdateRWAValue(
                owner.getSender(),
                0,
                toNano('25')
            );

            expect(updateResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: false,
                exitCode: 606, // error::not_verified
            });
        });
    });

    describe('Batch Registration', () => {
        it('should batch register multiple RWAs', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const estateId = 12345;

            // Prepare batch of 3 RWAs
            const rwaList = beginCell()
                .storeUint(3, 8) // count
                // RWA 1
                .storeUint(RWA_TYPES.REAL_ESTATE, 8)
                .storeCoins(toNano('100'))
                .storeUint(BigInt('0x' + 'b'.repeat(64)), 256)
                // RWA 2
                .storeUint(RWA_TYPES.VEHICLE, 8)
                .storeCoins(toNano('50'))
                .storeUint(BigInt('0x' + 'c'.repeat(64)), 256)
                // RWA 3
                .storeUint(RWA_TYPES.COLLECTIBLE, 8)
                .storeCoins(toNano('25'))
                .storeUint(BigInt('0x' + 'd'.repeat(64)), 256)
                .endCell();

            const batchResult = await rwa.sendBatchRegister(
                owner.getSender(),
                estateId,
                rwaList,
                toNano('0.03') // 0.01 TON per RWA * 3
            );

            expect(batchResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: true,
                value: toNano('0.03'),
            });

            const stats = await rwa.getRegistryStats();
            expect(stats.rwa_counter).toBe(3);

            // Check all RWAs were registered
            for (let i = 0; i < 3; i++) {
                const info = await rwa.getRWAInfo(i);
                expect(info.estate_id).toBe(estateId);
                expect(info.exists).toBe(true);
            }
        });

        it('should reject batch with insufficient fee', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            const rwaList = beginCell()
                .storeUint(2, 8) // count
                .storeUint(RWA_TYPES.FINANCIAL, 8)
                .storeCoins(toNano('80'))
                .storeUint(BigInt('0x' + 'e'.repeat(64)), 256)
                .storeUint(RWA_TYPES.INTELLECTUAL, 8)
                .storeCoins(toNano('60'))
                .storeUint(BigInt('0x' + 'f'.repeat(64)), 256)
                .endCell();

            const batchResult = await rwa.sendBatchRegister(
                owner.getSender(),
                12345,
                rwaList,
                toNano('0.01') // Only 0.01 TON for 2 RWAs (needs 0.02)
            );

            expect(batchResult.transactions).toHaveTransaction({
                from: owner.address,
                to: rwa.address,
                success: false,
                exitCode: 611, // error::insufficient_fee
            });
        });
    });

    describe('RWA Claims', () => {
        it('should allow beneficiary to claim RWA', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const beneficiary = await blockchain.treasury('beneficiary');

            // Register and verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.REAL_ESTATE,
                toNano('100'),
                BigInt('0x' + '10'.repeat(32)),
                toNano('0.01')
            );

            await rwa.sendVerifyRWA(deployer.getSender(), 0);

            // Claim RWA (assuming estate is claimable)
            const claimResult = await rwa.sendClaimRWA(
                beneficiary.getSender(),
                0,
                true // estate_claimable
            );

            expect(claimResult.transactions).toHaveTransaction({
                from: beneficiary.address,
                to: rwa.address,
                success: true,
            });

            const info = await rwa.getRWAInfo(0);
            expect(info.status).toBe(RWA_STATUS.CLAIMED);
            expect(info.owner.equals(beneficiary.address)).toBe(true);
        });

        it('should reject claim if estate not claimable', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const beneficiary = await blockchain.treasury('beneficiary');

            // Register and verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.VEHICLE,
                toNano('50'),
                BigInt('0x' + '11'.repeat(32)),
                toNano('0.01')
            );

            await rwa.sendVerifyRWA(deployer.getSender(), 0);

            // Try to claim when estate not claimable
            const claimResult = await rwa.sendClaimRWA(
                beneficiary.getSender(),
                0,
                false // estate not claimable
            );

            expect(claimResult.transactions).toHaveTransaction({
                from: beneficiary.address,
                to: rwa.address,
                success: false,
                exitCode: 601, // error::unauthorized
            });
        });

        it('should reject claiming unverified RWA', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const beneficiary = await blockchain.treasury('beneficiary');

            // Register but don't verify RWA
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.COLLECTIBLE,
                toNano('25'),
                BigInt('0x' + '12'.repeat(32)),
                toNano('0.01')
            );

            // Try to claim unverified RWA
            const claimResult = await rwa.sendClaimRWA(
                beneficiary.getSender(),
                0,
                true
            );

            expect(claimResult.transactions).toHaveTransaction({
                from: beneficiary.address,
                to: rwa.address,
                success: false,
                exitCode: 606, // error::not_verified
            });
        });
    });

    describe('Get Methods', () => {
        it('should return RWA info', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const estateId = 12345;

            await rwa.sendRegisterRWA(
                owner.getSender(),
                estateId,
                RWA_TYPES.REAL_ESTATE,
                toNano('100'),
                BigInt('0x' + '13'.repeat(32)),
                toNano('0.01')
            );

            const info = await rwa.getRWAInfo(0);
            
            expect(info.estate_id).toBe(estateId);
            expect(info.rwa_type).toBe(RWA_TYPES.REAL_ESTATE);
            expect(info.owner.equals(owner.address)).toBe(true);
            expect(info.value).toBe(toNano('100'));
            expect(info.status).toBe(RWA_STATUS.PENDING);
            expect(info.exists).toBe(true);
        });

        it('should return registry stats', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');

            // Register 2 RWAs
            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.VEHICLE,
                toNano('50'),
                BigInt('0x' + '14'.repeat(32)),
                toNano('0.01')
            );

            await rwa.sendRegisterRWA(
                owner.getSender(),
                12345,
                RWA_TYPES.FINANCIAL,
                toNano('150'),
                BigInt('0x' + '15'.repeat(32)),
                toNano('0.01')
            );

            // Verify one of them
            await rwa.sendVerifyRWA(deployer.getSender(), 1);

            const stats = await rwa.getRegistryStats();
            
            expect(stats.rwa_counter).toBe(2);
            expect(stats.total_value_locked).toBe(toNano('150')); // Only verified RWA value
        });

        it('should return estate RWAs', async () => {
            const rwa = await deployRWA();
            const owner = await blockchain.treasury('owner');
            const estateId1 = 12345;
            const estateId2 = 67890;

            // Register RWAs for different estates
            await rwa.sendRegisterRWA(
                owner.getSender(),
                estateId1,
                RWA_TYPES.REAL_ESTATE,
                toNano('100'),
                BigInt('0x' + '16'.repeat(32)),
                toNano('0.01')
            );

            await rwa.sendRegisterRWA(
                owner.getSender(),
                estateId1,
                RWA_TYPES.VEHICLE,
                toNano('50'),
                BigInt('0x' + '17'.repeat(32)),
                toNano('0.01')
            );

            await rwa.sendRegisterRWA(
                owner.getSender(),
                estateId2,
                RWA_TYPES.COLLECTIBLE,
                toNano('25'),
                BigInt('0x' + '18'.repeat(32)),
                toNano('0.01')
            );

            const estate1RWAs = await rwa.getEstateRWAs(estateId1);
            const estate2RWAs = await rwa.getEstateRWAs(estateId2);
            
            // Estate 1 should have 2 RWAs (IDs 0 and 1)
            expect(estate1RWAs).toBeDefined();
            
            // Estate 2 should have 1 RWA (ID 2)
            expect(estate2RWAs).toBeDefined();
        });
    });
});