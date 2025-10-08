import { 
    Address, 
    beginCell, 
    Cell, 
    Contract, 
    contractAddress, 
    ContractProvider, 
    Sender, 
    SendMode,
    toNano
} from 'ton-core';

export type DefaiAppFactoryConfig = {
    owner: Address;
    treasury: Address;
    jettonWallet: Address;
    platformFeeBps: number;
};

export type AppRegistration = {
    appId: number;
    creator: Address;
    price: bigint;
    maxSupply: number;
    currentSupply: number;
    isActive: boolean;
    metadataUri: string;
    createdAt: number;
};

export type AppReview = {
    appId: number;
    reviewer: Address;
    rating: number;
    commentCid: string;
    timestamp: number;
    exists: boolean;
};

export class DefaiAppFactory implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new DefaiAppFactory(address);
    }

    static createFromConfig(config: DefaiAppFactoryConfig, code: Cell, workchain = 0) {
        const data = beginCell()
            .storeAddress(config.owner)
            .storeAddress(config.treasury)
            .storeAddress(config.jettonWallet)
            .storeUint(config.platformFeeBps, 16)
            .storeUint(0, 1) // is_paused
            .storeUint(0, 32) // next_app_id
            .storeRef(beginCell().endCell()) // apps
            .storeRef(beginCell().endCell()) // user_access
            .storeRef(beginCell().endCell()) // reviews
            .storeRef(beginCell().endCell()) // refunds
            .storeRef(beginCell().endCell()) // app_ratings
            .storeRef(beginCell().endCell()) // app_review_counts
            .endCell();
        const init = { code, data };
        return new DefaiAppFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // Operation codes
    static readonly OPS = {
        REGISTER_APP: 0x1,
        PURCHASE_APP: 0x2,
        TOGGLE_APP_STATUS: 0x3,
        UPDATE_APP_METADATA: 0x4,
        SUBMIT_REVIEW: 0x5,
        UPDATE_REVIEW: 0x6,
        REFUND_PURCHASE: 0x7,
        UPDATE_PLATFORM_SETTINGS: 0x8,
        PAUSE: 0x9,
        UNPAUSE: 0xa,
        BATCH_PURCHASE: 0xb,
    };

    // Message builders
    async sendRegisterApp(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            price: bigint;
            maxSupply: number;
            metadataUri: string;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(DefaiAppFactory.OPS.REGISTER_APP, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeCoins(opts.price)
                .storeUint(opts.maxSupply, 32)
                .storeRef(beginCell().storeStringTail(opts.metadataUri).endCell())
                .endCell(),
        });
    }

    async sendPurchaseApp(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            appId: number;
            paymentAmount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(DefaiAppFactory.OPS.PURCHASE_APP, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeUint(opts.appId, 32)
                .storeCoins(opts.paymentAmount)
                .endCell(),
        });
    }

    async sendToggleAppStatus(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            appId: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(DefaiAppFactory.OPS.TOGGLE_APP_STATUS, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeUint(opts.appId, 32)
                .endCell(),
        });
    }

    async sendSubmitReview(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            appId: number;
            rating: number;
            commentCid: string;
        }
    ) {
        if (opts.rating < 1 || opts.rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }
        
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(DefaiAppFactory.OPS.SUBMIT_REVIEW, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeUint(opts.appId, 32)
                .storeUint(opts.rating, 8)
                .storeRef(beginCell().storeStringTail(opts.commentCid).endCell())
                .endCell(),
        });
    }

    async sendUpdatePlatformSettings(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            platformFeeBps: number;
            treasury: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(DefaiAppFactory.OPS.UPDATE_PLATFORM_SETTINGS, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeUint(opts.platformFeeBps, 16)
                .storeAddress(opts.treasury)
                .endCell(),
        });
    }

    async sendPause(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(DefaiAppFactory.OPS.PAUSE, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .endCell(),
        });
    }

    async sendUnpause(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(DefaiAppFactory.OPS.UNPAUSE, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .endCell(),
        });
    }

    // Getter methods
    async getContractData(provider: ContractProvider) {
        const result = await provider.get('get_contract_data', []);
        return {
            totalApps: result.stack.readNumber(),
            owner: result.stack.readAddress(),
            treasury: result.stack.readAddress(),
            platformFeeBps: result.stack.readNumber(),
            isPaused: result.stack.readBoolean(),
            nextAppId: result.stack.readNumber(),
        };
    }

    async getApp(provider: ContractProvider, appId: number): Promise<AppRegistration> {
        const result = await provider.get('get_app', [
            { type: 'int', value: BigInt(appId) }
        ]);
        
        return {
            appId: result.stack.readNumber(),
            creator: result.stack.readAddress(),
            price: result.stack.readBigNumber(),
            maxSupply: result.stack.readNumber(),
            currentSupply: result.stack.readNumber(),
            isActive: result.stack.readBoolean(),
            metadataUri: result.stack.readString(),
            createdAt: result.stack.readNumber(),
        };
    }

    async getUserHasAccess(provider: ContractProvider, user: Address, appId: number): Promise<boolean> {
        const result = await provider.get('get_user_has_access', [
            { type: 'slice', cell: beginCell().storeAddress(user).endCell() },
            { type: 'int', value: BigInt(appId) }
        ]);
        return result.stack.readBoolean();
    }

    async getAppAverageRating(provider: ContractProvider, appId: number): Promise<number> {
        const result = await provider.get('get_app_average_rating', [
            { type: 'int', value: BigInt(appId) }
        ]);
        return result.stack.readNumber() / 100; // Convert from rating * 100 to actual rating
    }

    async getTotalApps(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_total_apps', []);
        return result.stack.readNumber();
    }
}