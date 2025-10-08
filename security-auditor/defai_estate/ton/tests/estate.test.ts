import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';

describe('DefAI Estate Contract', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let estateContract: SandboxContract<any>;
    let estateCode: Cell;

    beforeAll(async () => {
        estateCode = await compile('defai-estate');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
    });

    async function deployEstate(inactivityPeriod = 365 * 24 * 60 * 60, gracePeriod = 30 * 24 * 60 * 60) {
        const estateData = beginCell()
            .storeAddress(deployer.address)
            .storeUint(0, 256)
            .storeUint(Math.floor(Date.now() / 1000), 64)
            .storeUint(inactivityPeriod, 64)
            .storeUint(gracePeriod, 64)
            .storeUint(Math.floor(Date.now() / 1000), 64)
            .storeCoins(0)
            .storeUint(0, 8)
            .storeUint(1, 64)
            .storeUint(0, 32)
            .storeUint(0, 32)
            .storeDict(null)
            .storeDict(null)
            .storeDict(null)
            .storeDict(null)
            .endCell();

        estateContract = blockchain.openContract({
            code: estateCode,
            data: estateData,
            address: deployer.address,
        });

        const deployResult = await estateContract.sendDeploy(deployer.getSender(), toNano('0.5'));
        
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: estateContract.address,
            deploy: true,
            success: true,
        });

        return estateContract;
    }

    describe('Estate Creation', () => {
        it('should create estate with valid parameters', async () => {
            const estate = await deployEstate();
            
            const createResult = await estate.sendCreateEstate(
                deployer.getSender(),
                365 * 24 * 60 * 60, // 1 year inactivity
                30 * 24 * 60 * 60,  // 30 days grace
                1 // estate number
            );

            expect(createResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: true,
            });
        });

        it('should reject estate with invalid inactivity period', async () => {
            const estate = await deployEstate();
            
            const createResult = await estate.sendCreateEstate(
                deployer.getSender(),
                60, // Too short (< 24 hours)
                30 * 24 * 60 * 60,
                1
            );

            expect(createResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: false,
                exitCode: 402, // error::invalid_period
            });
        });

        it('should reject estate with invalid grace period', async () => {
            const estate = await deployEstate();
            
            const createResult = await estate.sendCreateEstate(
                deployer.getSender(),
                365 * 24 * 60 * 60,
                100 * 24 * 60 * 60, // Too long (> 90 days)
                1
            );

            expect(createResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: false,
                exitCode: 402, // error::invalid_period
            });
        });
    });

    describe('Beneficiary Management', () => {
        it('should add beneficiary with valid share', async () => {
            const estate = await deployEstate();
            const beneficiary = await blockchain.treasury('beneficiary');
            
            const addResult = await estate.sendAddBeneficiary(
                deployer.getSender(),
                beneficiary.address,
                5000 // 50% share
            );

            expect(addResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: true,
            });
        });

        it('should reject adding more than 10 beneficiaries', async () => {
            const estate = await deployEstate();
            
            // Add 10 beneficiaries (maximum)
            for (let i = 0; i < 10; i++) {
                const beneficiary = await blockchain.treasury(`beneficiary${i}`);
                await estate.sendAddBeneficiary(
                    deployer.getSender(),
                    beneficiary.address,
                    900 // 9% share each
                );
            }

            // Try to add 11th beneficiary
            const extraBeneficiary = await blockchain.treasury('extra');
            const addResult = await estate.sendAddBeneficiary(
                deployer.getSender(),
                extraBeneficiary.address,
                1000
            );

            expect(addResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: false,
                exitCode: 410, // error::max_beneficiaries
            });
        });

        it('should reject beneficiary shares exceeding 100%', async () => {
            const estate = await deployEstate();
            const beneficiary1 = await blockchain.treasury('beneficiary1');
            const beneficiary2 = await blockchain.treasury('beneficiary2');
            
            // Add first beneficiary with 60% share
            await estate.sendAddBeneficiary(
                deployer.getSender(),
                beneficiary1.address,
                6000
            );

            // Try to add second with 50% (total would be 110%)
            const addResult = await estate.sendAddBeneficiary(
                deployer.getSender(),
                beneficiary2.address,
                5000
            );

            expect(addResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: false,
                exitCode: 407, // error::invalid_share
            });
        });
    });

    describe('Trading Functions', () => {
        it('should enable trading with valid parameters', async () => {
            const estate = await deployEstate();
            const aiAgent = await blockchain.treasury('aiAgent');
            
            const enableResult = await estate.sendEnableTrading(
                deployer.getSender(),
                aiAgent.address,
                70, // 70% human share
                1,  // Balanced strategy
                10, // 10% stop loss
                48  // 48 hours emergency delay
            );

            expect(enableResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: true,
            });

            const status = await estate.getTradingStatus();
            expect(status).toBe(1); // Trading enabled
        });

        it('should reject invalid human share', async () => {
            const estate = await deployEstate();
            const aiAgent = await blockchain.treasury('aiAgent');
            
            const enableResult = await estate.sendEnableTrading(
                deployer.getSender(),
                aiAgent.address,
                30, // Less than 50% minimum
                1,
                10,
                48
            );

            expect(enableResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: false,
                exitCode: 407, // error::invalid_share
            });
        });

        it('should reject invalid emergency delay', async () => {
            const estate = await deployEstate();
            const aiAgent = await blockchain.treasury('aiAgent');
            
            const enableResult = await estate.sendEnableTrading(
                deployer.getSender(),
                aiAgent.address,
                70,
                1,
                10,
                200 // > 168 hours maximum
            );

            expect(enableResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: false,
                exitCode: 408, // error::invalid_delay
            });
        });
    });

    describe('Deposit and Withdrawal', () => {
        it('should accept deposits', async () => {
            const estate = await deployEstate();
            
            const depositResult = await estate.sendDeposit(
                deployer.getSender(),
                toNano('1')
            );

            expect(depositResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: true,
                value: toNano('1'),
            });

            const info = await estate.getEstateInfo();
            expect(info.estate_value).toBeGreaterThanOrEqual(toNano('1'));
        });

        it('should track deposits for trading accounts', async () => {
            const estate = await deployEstate();
            const aiAgent = await blockchain.treasury('aiAgent');
            
            // Enable trading first
            await estate.sendEnableTrading(
                deployer.getSender(),
                aiAgent.address,
                60,
                1,
                10,
                48
            );

            // Human deposit
            await estate.sendDeposit(
                deployer.getSender(),
                toNano('2')
            );

            // AI agent deposit
            await estate.sendDeposit(
                aiAgent.getSender(),
                toNano('1')
            );

            const info = await estate.getEstateInfo();
            expect(info.estate_value).toBeGreaterThanOrEqual(toNano('3'));
        });
    });

    describe('Activity Updates', () => {
        it('should update last active timestamp', async () => {
            const estate = await deployEstate();
            
            const initialInfo = await estate.getEstateInfo();
            const initialActive = initialInfo.last_active;

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 2000));

            const updateResult = await estate.sendUpdateActivity(
                deployer.getSender()
            );

            expect(updateResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: estate.address,
                success: true,
            });

            const updatedInfo = await estate.getEstateInfo();
            expect(updatedInfo.last_active).toBeGreaterThan(initialActive);
        });

        it('should only allow owner to update activity', async () => {
            const estate = await deployEstate();
            const other = await blockchain.treasury('other');
            
            const updateResult = await estate.sendUpdateActivity(
                other.getSender()
            );

            expect(updateResult.transactions).toHaveTransaction({
                from: other.address,
                to: estate.address,
                success: false,
                exitCode: 401, // error::unauthorized
            });
        });
    });

    describe('Get Methods', () => {
        it('should return correct estate info', async () => {
            const estate = await deployEstate();
            
            const info = await estate.getEstateInfo();
            
            expect(info.estate_number).toBe(1);
            expect(info.owner.equals(deployer.address)).toBe(true);
            expect(info.estate_value).toBe(0);
            expect(info.inactivity_period).toBe(365 * 24 * 60 * 60);
            expect(info.grace_period).toBe(30 * 24 * 60 * 60);
            expect(info.is_locked).toBe(false);
            expect(info.is_claimable).toBe(false);
        });

        it('should return beneficiaries dict', async () => {
            const estate = await deployEstate();
            const beneficiary = await blockchain.treasury('beneficiary');
            
            await estate.sendAddBeneficiary(
                deployer.getSender(),
                beneficiary.address,
                5000
            );

            const beneficiaries = await estate.getBeneficiaries();
            expect(beneficiaries).toBeDefined();
        });

        it('should return trading status', async () => {
            const estate = await deployEstate();
            
            let status = await estate.getTradingStatus();
            expect(status).toBe(0); // Not enabled
            
            const aiAgent = await blockchain.treasury('aiAgent');
            await estate.sendEnableTrading(
                deployer.getSender(),
                aiAgent.address,
                60,
                1,
                10,
                48
            );

            status = await estate.getTradingStatus();
            expect(status).toBe(1); // Enabled
        });
    });
});