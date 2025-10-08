import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano, Address, beginCell } from 'ton-core';
import { DefaiAppFactory } from '../defai_app_factory_wrapper';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('DefaiAppFactory', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let creator: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;
    let defaiAppFactory: SandboxContract<DefaiAppFactory>;

    beforeAll(async () => {
        // Mock compile function since we're testing without blueprint
        code = await Cell.fromBase64('te6ccgEBBAEAJAABFP8A9KQT9LzyyAsBAgEgAgMABNIwAA=='); // Minimal valid contract code
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        
        deployer = await blockchain.treasury('deployer');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');
        creator = await blockchain.treasury('creator');
        treasury = await blockchain.treasury('treasury');

        // Create mock jetton wallet address
        const jettonWallet = Address.parse('EQD__________________________________________0');

        defaiAppFactory = blockchain.openContract(
            DefaiAppFactory.createFromConfig({
                owner: deployer.address,
                treasury: treasury.address,
                jettonWallet: jettonWallet,
                platformFeeBps: 500, // 5% fee
            }, code)
        );

        const deployResult = await defaiAppFactory.sendDeploy(
            deployer.getSender(),
            toNano('0.05')
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: defaiAppFactory.address,
            deploy: true,
            success: true,
        });
    });

    describe('App Registration', () => {
        it('should register a new app successfully', async () => {
            const result = await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('100'),
                    maxSupply: 1000,
                    metadataUri: 'ipfs://QmTest123',
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: creator.address,
                to: defaiAppFactory.address,
                success: true,
            });
        });

        it('should fail to register app with zero price', async () => {
            const result = await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('0'),
                    maxSupply: 1000,
                    metadataUri: 'ipfs://QmTest123',
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: creator.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 102, // error::invalid_price
            });
        });

        it('should fail to register app with zero max supply', async () => {
            const result = await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('100'),
                    maxSupply: 0,
                    metadataUri: 'ipfs://QmTest123',
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: creator.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 103, // error::invalid_max_supply
            });
        });

        it('should fail with metadata URI too long', async () => {
            const longUri = 'ipfs://' + 'Q'.repeat(150); // Exceeds MAX_METADATA_URI_LEN
            
            const result = await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('100'),
                    maxSupply: 1000,
                    metadataUri: longUri,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: creator.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 104, // error::metadata_uri_too_long
            });
        });
    });

    describe('App Purchasing', () => {
        beforeEach(async () => {
            // Register an app first
            await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('100'),
                    maxSupply: 10,
                    metadataUri: 'ipfs://QmTest123',
                }
            );
        });

        it('should purchase app access successfully', async () => {
            const result = await defaiAppFactory.sendPurchaseApp(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    appId: 0,
                    paymentAmount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: true,
            });
        });

        it('should fail to purchase non-existent app', async () => {
            const result = await defaiAppFactory.sendPurchaseApp(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    appId: 999,
                    paymentAmount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 118, // error::app_does_not_exist
            });
        });

        it('should fail to purchase with insufficient payment', async () => {
            const result = await defaiAppFactory.sendPurchaseApp(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    appId: 0,
                    paymentAmount: toNano('50'), // Less than required 100
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 109, // error::insufficient_balance
            });
        });

        it('should fail to purchase same app twice', async () => {
            // First purchase
            await defaiAppFactory.sendPurchaseApp(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    appId: 0,
                    paymentAmount: toNano('100'),
                }
            );

            // Second purchase attempt
            const result = await defaiAppFactory.sendPurchaseApp(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    appId: 0,
                    paymentAmount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 119, // error::already_owns_app
            });
        });
    });

    describe('App Status Management', () => {
        beforeEach(async () => {
            await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('100'),
                    maxSupply: 10,
                    metadataUri: 'ipfs://QmTest123',
                }
            );
        });

        it('should toggle app status by creator', async () => {
            const result = await defaiAppFactory.sendToggleAppStatus(
                creator.getSender(),
                {
                    value: toNano('0.05'),
                    appId: 0,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: creator.address,
                to: defaiAppFactory.address,
                success: true,
            });
        });

        it('should fail to toggle status by non-creator', async () => {
            const result = await defaiAppFactory.sendToggleAppStatus(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                    appId: 0,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 107, // error::unauthorized_creator
            });
        });
    });

    describe('Review System', () => {
        beforeEach(async () => {
            // Register app
            await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('100'),
                    maxSupply: 10,
                    metadataUri: 'ipfs://QmTest123',
                }
            );

            // User purchases app
            await defaiAppFactory.sendPurchaseApp(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    appId: 0,
                    paymentAmount: toNano('100'),
                }
            );
        });

        it('should submit review successfully', async () => {
            const result = await defaiAppFactory.sendSubmitReview(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                    appId: 0,
                    rating: 5,
                    commentCid: 'QmReview123',
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: true,
            });
        });

        it('should fail to review without owning app', async () => {
            const result = await defaiAppFactory.sendSubmitReview(
                user2.getSender(),
                {
                    value: toNano('0.05'),
                    appId: 0,
                    rating: 5,
                    commentCid: 'QmReview123',
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user2.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 110, // error::must_own_app_to_review
            });
        });

        it('should fail with invalid rating', async () => {
            const result = await defaiAppFactory.sendSubmitReview(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                    appId: 0,
                    rating: 6, // Invalid rating > 5
                    commentCid: 'QmReview123',
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 111, // error::invalid_rating
            });
        });

        it('should fail with comment CID too long', async () => {
            const longCid = 'Q' + 'm'.repeat(50); // Exceeds MAX_REVIEW_CID_LEN
            
            const result = await defaiAppFactory.sendSubmitReview(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                    appId: 0,
                    rating: 5,
                    commentCid: longCid,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 112, // error::comment_cid_too_long
            });
        });
    });

    describe('Platform Settings', () => {
        it('should update platform settings by owner', async () => {
            const newTreasury = await blockchain.treasury('newTreasury');
            
            const result = await defaiAppFactory.sendUpdatePlatformSettings(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    platformFeeBps: 1000, // 10%
                    treasury: newTreasury.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiAppFactory.address,
                success: true,
            });
        });

        it('should fail to update settings by non-owner', async () => {
            const result = await defaiAppFactory.sendUpdatePlatformSettings(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                    platformFeeBps: 1000,
                    treasury: treasury.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 121, // error::unauthorized
            });
        });

        it('should fail with invalid platform fee', async () => {
            const result = await defaiAppFactory.sendUpdatePlatformSettings(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    platformFeeBps: 10001, // > 100%
                    treasury: treasury.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 101, // error::invalid_platform_fee
            });
        });
    });

    describe('Pause/Unpause', () => {
        it('should pause contract by owner', async () => {
            const result = await defaiAppFactory.sendPause(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiAppFactory.address,
                success: true,
            });
        });

        it('should unpause contract by owner', async () => {
            // First pause
            await defaiAppFactory.sendPause(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                }
            );

            // Then unpause
            const result = await defaiAppFactory.sendUnpause(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: defaiAppFactory.address,
                success: true,
            });
        });

        it('should fail to pause by non-owner', async () => {
            const result = await defaiAppFactory.sendPause(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 121, // error::unauthorized
            });
        });

        it('should block operations when paused', async () => {
            // Pause the contract
            await defaiAppFactory.sendPause(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                }
            );

            // Try to register app while paused
            const result = await defaiAppFactory.sendRegisterApp(
                creator.getSender(),
                {
                    value: toNano('0.1'),
                    price: toNano('100'),
                    maxSupply: 10,
                    metadataUri: 'ipfs://QmTest123',
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: creator.address,
                to: defaiAppFactory.address,
                success: false,
                exitCode: 120, // error::contract_paused
            });
        });
    });
});