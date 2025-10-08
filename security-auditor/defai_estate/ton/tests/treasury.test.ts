import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, beginCell, Address } from '@ton/core';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';
import { extendContract, toNano } from './test-helpers';

describe('DefAI Treasury Contract', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let treasuryContract: SandboxContract<any>;
    let treasuryCode: Cell;
    let signers: SandboxContract<TreasuryContract>[];

    beforeAll(async () => {
        treasuryCode = await compile('defai-treasury');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        
        // Create signers
        signers = [];
        for (let i = 0; i < 5; i++) {
            signers.push(await blockchain.treasury(`signer${i}`));
        }
    });

    async function deployTreasury(threshold = 3) {
        // Prepare signers cell
        const signersCell = beginCell();
        for (const signer of signers.slice(0, 5)) {
            signersCell.storeAddress(signer.address);
        }

        const treasuryData = beginCell()
            .storeAddress(deployer.address) // admin
            .storeAddress(null) // pending_admin
            .storeUint(0, 64) // admin_timelock
            .storeCoins(0) // total_collected
            .storeUint(250, 16) // platform_fee_bps (2.5%)
            .storeUint(0, 1) // paused
            .storeUint(threshold, 8) // threshold
            .storeUint(5, 8) // signer_count
            .storeUint(0, 32) // proposal_count
            .storeDict(null) // signers
            .storeDict(null) // proposals
            .storeDict(null) // estate_registry
            .endCell();

        treasuryContract = extendContract(blockchain.openContract({
            code: treasuryCode,
            data: treasuryData,
            address: deployer.address,
        }));

        const deployResult = await treasuryContract.sendDeploy(
            deployer.getSender(),
            toNano('0.5')
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: treasuryContract.address,
            deploy: true,
            success: true,
        });

        // Initialize treasury with signers
        await treasuryContract.sendInitTreasury(
            deployer.getSender(),
            deployer.address,
            signersCell.endCell(),
            threshold
        );

        return treasuryContract;
    }

    describe('Treasury Initialization', () => {
        it('should initialize with valid parameters', async () => {
            const treasury = await deployTreasury(3);
            
            const info = await treasury.getTreasuryInfo();
            expect(info.platform_fee_bps).toBe(250);
            expect(info.paused).toBe(false);
            expect(info.proposal_count).toBe(0);
        });

        it('should reject invalid threshold', async () => {
            const treasuryData = beginCell()
                .storeAddress(deployer.address)
                .storeAddress(null)
                .storeUint(0, 64)
                .storeCoins(0)
                .storeUint(250, 16)
                .storeUint(0, 1)
                .storeUint(1, 8) // Invalid threshold (< 2)
                .storeUint(5, 8)
                .storeUint(0, 32)
                .storeDict(null)
                .storeDict(null)
                .storeDict(null)
                .endCell();

            treasuryContract = blockchain.openContract({
                code: treasuryCode,
                data: treasuryData,
                address: deployer.address,
            });

            const signersCell = beginCell();
            for (const signer of signers) {
                signersCell.storeAddress(signer.address);
            }

            const initResult = await treasuryContract.sendInitTreasury(
                deployer.getSender(),
                deployer.address,
                signersCell.endCell(),
                1 // Invalid threshold
            );

            expect(initResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: treasuryContract.address,
                success: false,
                exitCode: 502, // error::invalid_threshold
            });
        });
    });

    describe('Fee Collection', () => {
        it('should collect fees from estates', async () => {
            const treasury = await deployTreasury();
            const estateId = 12345;
            const feeAmount = toNano('1');

            const collectResult = await treasury.sendCollectFees(
                deployer.getSender(),
                estateId,
                feeAmount
            );

            expect(collectResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: treasury.address,
                success: true,
                value: feeAmount,
            });

            const info = await treasury.getTreasuryInfo();
            // 2.5% of 1 TON = 0.025 TON
            expect(info.total_collected).toBeGreaterThanOrEqual(toNano('0.025'));
        });

        it('should reject fee collection when paused', async () => {
            const treasury = await deployTreasury();
            
            // First pause the treasury (would need proper proposal in production)
            await treasury.sendEmergencyPause(deployer.getSender());

            const collectResult = await treasury.sendCollectFees(
                deployer.getSender(),
                12345,
                toNano('1')
            );

            expect(collectResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: treasury.address,
                success: false,
                exitCode: 510, // error::paused
            });
        });
    });

    describe('Proposal Management', () => {
        it('should create proposal by authorized signer', async () => {
            const treasury = await deployTreasury();
            const targetAddress = await blockchain.treasury('target');
            
            const createResult = await treasury.sendCreateProposal(
                signers[0].getSender(),
                1, // PROPOSAL_WITHDRAW
                targetAddress.address,
                toNano('0.5'),
                beginCell().endCell()
            );

            expect(createResult.transactions).toHaveTransaction({
                from: signers[0].address,
                to: treasury.address,
                success: true,
            });

            const info = await treasury.getTreasuryInfo();
            expect(info.proposal_count).toBe(1);
        });

        it('should reject proposal from non-signer', async () => {
            const treasury = await deployTreasury();
            const nonSigner = await blockchain.treasury('nonSigner');
            const targetAddress = await blockchain.treasury('target');
            
            const createResult = await treasury.sendCreateProposal(
                nonSigner.getSender(),
                1,
                targetAddress.address,
                toNano('0.5'),
                beginCell().endCell()
            );

            expect(createResult.transactions).toHaveTransaction({
                from: nonSigner.address,
                to: treasury.address,
                success: false,
                exitCode: 501, // error::unauthorized
            });
        });

        it('should approve proposal by different signer', async () => {
            const treasury = await deployTreasury();
            const targetAddress = await blockchain.treasury('target');
            
            // Create proposal
            await treasury.sendCreateProposal(
                signers[0].getSender(),
                1,
                targetAddress.address,
                toNano('0.5'),
                beginCell().endCell()
            );

            // Approve by different signer
            const approveResult = await treasury.sendApproveProposal(
                signers[1].getSender(),
                0 // proposal_id
            );

            expect(approveResult.transactions).toHaveTransaction({
                from: signers[1].address,
                to: treasury.address,
                success: true,
            });
        });

        it('should reject duplicate approval', async () => {
            const treasury = await deployTreasury();
            const targetAddress = await blockchain.treasury('target');
            
            // Create proposal
            await treasury.sendCreateProposal(
                signers[0].getSender(),
                1,
                targetAddress.address,
                toNano('0.5'),
                beginCell().endCell()
            );

            // First approval
            await treasury.sendApproveProposal(
                signers[1].getSender(),
                0
            );

            // Try duplicate approval
            const duplicateResult = await treasury.sendApproveProposal(
                signers[1].getSender(),
                0
            );

            expect(duplicateResult.transactions).toHaveTransaction({
                from: signers[1].address,
                to: treasury.address,
                success: false,
                exitCode: 505, // error::already_approved
            });
        });

        it('should execute proposal after threshold met', async () => {
            const treasury = await deployTreasury(3); // Threshold of 3
            const targetAddress = await blockchain.treasury('target');
            
            // Fund treasury
            await deployer.send({
                to: treasury.address,
                value: toNano('2'),
            });

            // Create proposal
            await treasury.sendCreateProposal(
                signers[0].getSender(),
                1, // PROPOSAL_WITHDRAW
                targetAddress.address,
                toNano('0.5'),
                beginCell().endCell()
            );

            // Approve by signer 1 (total: 2)
            await treasury.sendApproveProposal(signers[1].getSender(), 0);

            // Approve by signer 2 (total: 3, meets threshold)
            await treasury.sendApproveProposal(signers[2].getSender(), 0);

            // Execute proposal
            const executeResult = await treasury.sendExecuteProposal(
                deployer.getSender(),
                0
            );

            expect(executeResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: treasury.address,
                success: true,
            });

            // Check funds were sent to target
            expect(executeResult.transactions).toHaveTransaction({
                from: treasury.address,
                to: targetAddress.address,
                value: toNano('0.5'),
            });
        });

        it('should reject execution with insufficient approvals', async () => {
            const treasury = await deployTreasury(3);
            const targetAddress = await blockchain.treasury('target');
            
            // Create proposal
            await treasury.sendCreateProposal(
                signers[0].getSender(),
                1,
                targetAddress.address,
                toNano('0.5'),
                beginCell().endCell()
            );

            // Only 2 approvals (proposer + 1)
            await treasury.sendApproveProposal(signers[1].getSender(), 0);

            // Try to execute
            const executeResult = await treasury.sendExecuteProposal(
                deployer.getSender(),
                0
            );

            expect(executeResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: treasury.address,
                success: false,
                exitCode: 507, // error::insufficient_approvals
            });
        });
    });

    describe('Admin Management', () => {
        it('should propose admin change', async () => {
            const treasury = await deployTreasury();
            const newAdmin = await blockchain.treasury('newAdmin');
            
            const proposeResult = await treasury.sendProposeAdminChange(
                deployer.getSender(),
                newAdmin.address
            );

            expect(proposeResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: treasury.address,
                success: true,
            });
        });

        it('should reject admin change from non-admin', async () => {
            const treasury = await deployTreasury();
            const newAdmin = await blockchain.treasury('newAdmin');
            const nonAdmin = await blockchain.treasury('nonAdmin');
            
            const proposeResult = await treasury.sendProposeAdminChange(
                nonAdmin.getSender(),
                newAdmin.address
            );

            expect(proposeResult.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: treasury.address,
                success: false,
                exitCode: 501, // error::unauthorized
            });
        });

        it('should reject accepting admin change before timelock', async () => {
            const treasury = await deployTreasury();
            const newAdmin = await blockchain.treasury('newAdmin');
            
            // Propose admin change
            await treasury.sendProposeAdminChange(
                deployer.getSender(),
                newAdmin.address
            );

            // Try to accept immediately (before 48 hour timelock)
            const acceptResult = await treasury.sendAcceptAdminChange(
                deployer.getSender()
            );

            expect(acceptResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: treasury.address,
                success: false,
                exitCode: 508, // error::timelock_active
            });
        });
    });

    describe('Get Methods', () => {
        it('should return treasury info', async () => {
            const treasury = await deployTreasury();
            
            const info = await treasury.getTreasuryInfo();
            
            expect(info.total_collected).toBe(0);
            expect(info.platform_fee_bps).toBe(250);
            expect(info.paused).toBe(false);
            expect(info.proposal_count).toBe(0);
        });

        it('should return multisig info', async () => {
            const treasury = await deployTreasury(3);
            
            const info = await treasury.getMultisigInfo();
            
            expect(info.threshold).toBe(3);
            expect(info.signer_count).toBe(5);
            expect(info.proposal_count).toBe(0);
        });

        it('should check if address is signer', async () => {
            const treasury = await deployTreasury();
            
            const isSigner0 = await treasury.isSignerMethod(signers[0].address);
            expect(isSigner0).toBe(true);
            
            const isSigner4 = await treasury.isSignerMethod(signers[4].address);
            expect(isSigner4).toBe(true);
            
            const randomAddress = await blockchain.treasury('random');
            const isRandomSigner = await treasury.isSignerMethod(randomAddress.address);
            expect(isRandomSigner).toBe(false);
        });
    });
});