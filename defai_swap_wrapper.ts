import { 
    Address, 
    beginCell, 
    Cell, 
    Contract, 
    contractAddress, 
    ContractProvider, 
    Sender, 
    SendMode,
    toNano,
    TupleBuilder
} from 'ton-core';

/**
 * DeFAI Swap Contract Wrapper for TON Blockchain
 * Provides TypeScript interface for interacting with the FunC contract
 */

// Operation codes matching FunC contract
export const Opcodes = {
    initialize: 0x7e8764ef,
    updatePrices: 0x4f89dc2a,
    updateTreasury: 0x8c3f5d21,
    pause: 0x2c5f4ab1,
    unpause: 0x9d4f2c8e,
    proposeAdmin: 0x5a8b3c71,
    acceptAdmin: 0x7f2e9d4a,
    initializeUserTax: 0x3b8c7f2d,
    resetUserTax: 0x6d4a8f3e,
    swapDefaiForNft: 0x8e7c3f5a,
    swapOldDefaiForNft: 0x2f8d6c4b,
    swapOgTier0: 0x9c3e7a8f,
    redeem: 0x4e8c7d2f,
    claimVested: 0x7a3f8c5d,
    claimAirdrop: 0x5c7d9e3f,
    claimVestedAirdrop: 0x8f3c7e5a,
    rerollBonus: 0x3d7c8f2e,
    adminWithdraw: 0x6f8c3a7e,
    initializeRandomness: 0x8c5f3e7d,
    commitRandomness: 0x7e3c8f5a,
    revealRandomness: 0x9f7c3e8d,
};

// Error codes matching FunC contract
export enum ErrorCode {
    INSUFFICIENT_OLD_TOKENS = 101,
    INSUFFICIENT_DEFAI_TOKENS = 102,
    NO_LIQUIDITY = 103,
    INVALID_COLLECTION = 104,
    MATH_OVERFLOW = 105,
    NFT_ALREADY_REDEEMED = 106,
    NO_NFT = 107,
    INVALID_INPUT = 108,
    INVALID_TREASURY = 109,
    UNAUTHORIZED = 110,
    INVALID_TIER = 111,
    ALREADY_CLAIMED = 112,
    INVALID_MERKLE_PROOF = 113,
    STILL_IN_CLIFF = 114,
    NOTHING_TO_CLAIM = 115,
    TAX_RESET_TOO_EARLY = 116,
    ALREADY_PAUSED = 117,
    NOT_PAUSED = 118,
    PROTOCOL_PAUSED = 119,
    INVALID_MINT = 120,
    INSUFFICIENT_DEFAI_FOR_REROLL = 121,
    NO_PENDING_ADMIN = 122,
    TIMELOCK_NOT_EXPIRED = 123,
    NOT_ON_OG_WHITELIST = 124,
    OG_TIER0_ALREADY_CLAIMED = 125,
    INVALID_NFT = 126,
    RANDOMNESS_NOT_READY = 127,
}

// Constants
export const CONSTANTS = {
    INITIAL_TAX_BPS: 500,        // 5%
    TAX_INCREMENT_BPS: 100,      // 1%
    TAX_CAP_BPS: 3000,          // 30%
    TAX_RESET_DURATION: 86400,   // 24 hours
    ADMIN_TIMELOCK_DURATION: 172800, // 48 hours
    VESTING_DURATION: 7776000,   // 90 days
    CLIFF_DURATION: 172800,      // 2 days
};

// Tier configuration
export enum Tier {
    OG = 0,
    TRAIN = 1,
    BOAT = 2,
    PLANE = 3,
    ROCKET = 4,
}

export interface TierBonusRange {
    min: number;
    max: number;
}

export const TIER_BONUS_RANGES: Record<Tier, TierBonusRange> = {
    [Tier.OG]: { min: 0, max: 0 },
    [Tier.TRAIN]: { min: 0, max: 1500 },
    [Tier.BOAT]: { min: 1500, max: 5000 },
    [Tier.PLANE]: { min: 2000, max: 10000 },
    [Tier.ROCKET]: { min: 5000, max: 30000 },
};

export interface DefaiSwapConfig {
    admin: Address;
    oldMint: Address;
    newMint: Address;
    collection: Address;
    treasury: Address;
    prices: bigint[];
    paused: boolean;
    vrfEnabled: boolean;
}

export interface UserTaxState {
    taxRateBps: number;
    lastSwapTimestamp: number;
    swapCount: number;
    exists: boolean;
}

export interface BonusState {
    tier: number;
    bonusBps: number;
    vestingStart: number;
    vestingDuration: number;
    claimed: boolean;
    feeDeducted: bigint;
}

export interface VestingState {
    totalAmount: bigint;
    releasedAmount: bigint;
    vestedAmount: bigint;
    startTimestamp: number;
    endTimestamp: number;
    lastClaimedTimestamp: number;
}

export class DefaiSwap implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new DefaiSwap(address);
    }

    static createFromConfig(config: DefaiSwapConfig, code: Cell, workchain = 0) {
        const data = DefaiSwap.configToCell(config);
        const init = { code, data };
        return new DefaiSwap(contractAddress(workchain, init), init);
    }

    static configToCell(config: DefaiSwapConfig): Cell {
        const pricesCell = beginCell();
        for (const price of config.prices) {
            pricesCell.storeCoins(price);
        }

        return beginCell()
            .storeAddress(config.admin)
            .storeAddress(config.oldMint)
            .storeAddress(config.newMint)
            .storeAddress(config.collection)
            .storeAddress(config.treasury)
            .storeRef(pricesCell.endCell())
            .storeBit(config.paused)
            .storeBit(false) // no pending admin
            .storeUint(0, 64) // admin change timestamp
            .storeBit(config.vrfEnabled)
            .endCell();
    }

    // ===============================================
    // Send Operations
    // ===============================================

    async sendInitialize(
        provider: ContractProvider,
        via: Sender,
        params: {
            oldMint: Address;
            newMint: Address;
            collection: Address;
            treasury: Address;
            prices: bigint[];
        }
    ) {
        const pricesCell = beginCell();
        for (const price of params.prices) {
            pricesCell.storeCoins(price);
        }

        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.initialize, 32)
                .storeUint(0, 64) // query_id
                .storeAddress(params.oldMint)
                .storeAddress(params.newMint)
                .storeAddress(params.collection)
                .storeAddress(params.treasury)
                .storeRef(pricesCell.endCell())
                .endCell(),
        });
    }

    async sendSwapDefaiForNft(
        provider: ContractProvider,
        via: Sender,
        params: {
            tier: Tier;
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.swapDefaiForNft, 32)
                .storeUint(0, 64) // query_id
                .storeUint(params.tier, 8)
                .endCell(),
        });
    }

    async sendSwapOldDefaiForNft(
        provider: ContractProvider,
        via: Sender,
        params: {
            tier: Tier;
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.swapOldDefaiForNft, 32)
                .storeUint(0, 64) // query_id
                .storeUint(params.tier, 8)
                .endCell(),
        });
    }

    async sendSwapOgTier0(
        provider: ContractProvider,
        via: Sender,
        params: {
            vestingAmount: bigint;
            merkleProof: Cell;
        }
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.swapOgTier0, 32)
                .storeUint(0, 64) // query_id
                .storeCoins(params.vestingAmount)
                .storeRef(params.merkleProof)
                .endCell(),
        });
    }

    async sendRedeem(
        provider: ContractProvider,
        via: Sender,
        params: {
            nftMint: Address;
        }
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.redeem, 32)
                .storeUint(0, 64) // query_id
                .storeAddress(params.nftMint)
                .endCell(),
        });
    }

    async sendClaimVested(
        provider: ContractProvider,
        via: Sender,
        params: {
            nftMint: Address;
        }
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.claimVested, 32)
                .storeUint(0, 64) // query_id
                .storeAddress(params.nftMint)
                .endCell(),
        });
    }

    async sendRerollBonus(
        provider: ContractProvider,
        via: Sender,
        params: {
            nftMint: Address;
        }
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.rerollBonus, 32)
                .storeUint(0, 64) // query_id
                .storeAddress(params.nftMint)
                .endCell(),
        });
    }

    async sendResetUserTax(
        provider: ContractProvider,
        via: Sender
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.resetUserTax, 32)
                .storeUint(0, 64) // query_id
                .endCell(),
        });
    }

    async sendPause(
        provider: ContractProvider,
        via: Sender
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.pause, 32)
                .storeUint(0, 64) // query_id
                .endCell(),
        });
    }

    async sendUnpause(
        provider: ContractProvider,
        via: Sender
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.unpause, 32)
                .storeUint(0, 64) // query_id
                .endCell(),
        });
    }

    async sendUpdatePrices(
        provider: ContractProvider,
        via: Sender,
        prices: bigint[]
    ) {
        const pricesCell = beginCell();
        for (const price of prices) {
            pricesCell.storeCoins(price);
        }

        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.updatePrices, 32)
                .storeUint(0, 64) // query_id
                .storeRef(pricesCell.endCell())
                .endCell(),
        });
    }

    async sendUpdateTreasury(
        provider: ContractProvider,
        via: Sender,
        treasury: Address
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.updateTreasury, 32)
                .storeUint(0, 64) // query_id
                .storeAddress(treasury)
                .endCell(),
        });
    }

    async sendProposeAdminChange(
        provider: ContractProvider,
        via: Sender,
        newAdmin: Address
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.proposeAdmin, 32)
                .storeUint(0, 64) // query_id
                .storeAddress(newAdmin)
                .endCell(),
        });
    }

    async sendAcceptAdminChange(
        provider: ContractProvider,
        via: Sender
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.acceptAdmin, 32)
                .storeUint(0, 64) // query_id
                .endCell(),
        });
    }

    // ===============================================
    // Get Methods
    // ===============================================

    async getConfig(provider: ContractProvider): Promise<DefaiSwapConfig> {
        const result = await provider.get('get_config', []);
        return {
            admin: result.stack.readAddress(),
            oldMint: result.stack.readAddress(),
            newMint: result.stack.readAddress(),
            collection: result.stack.readAddress(),
            treasury: result.stack.readAddress(),
            paused: result.stack.readBoolean(),
            vrfEnabled: result.stack.readBoolean(),
            prices: [], // Loaded separately
        };
    }

    async getTierPrices(provider: ContractProvider): Promise<bigint[]> {
        const result = await provider.get('get_tier_prices', []);
        return [
            result.stack.readBigNumber(),
            result.stack.readBigNumber(),
            result.stack.readBigNumber(),
            result.stack.readBigNumber(),
            result.stack.readBigNumber(),
        ];
    }

    async getUserTaxState(
        provider: ContractProvider,
        userAddress: Address
    ): Promise<UserTaxState> {
        const builder = new TupleBuilder();
        builder.writeAddress(userAddress);
        
        const result = await provider.get('get_user_tax_state', builder.build());
        return {
            taxRateBps: result.stack.readNumber(),
            lastSwapTimestamp: result.stack.readNumber(),
            swapCount: result.stack.readNumber(),
            exists: result.stack.readNumber() === 1,
        };
    }

    async getBonusState(
        provider: ContractProvider,
        nftMint: Address
    ): Promise<BonusState> {
        const builder = new TupleBuilder();
        builder.writeAddress(nftMint);
        
        const result = await provider.get('get_bonus_state', builder.build());
        return {
            tier: result.stack.readNumber(),
            bonusBps: result.stack.readNumber(),
            vestingStart: result.stack.readNumber(),
            vestingDuration: result.stack.readNumber(),
            claimed: result.stack.readNumber() === 1,
            feeDeducted: result.stack.readBigNumber(),
        };
    }

    async getVestingState(
        provider: ContractProvider,
        nftMint: Address
    ): Promise<VestingState> {
        const builder = new TupleBuilder();
        builder.writeAddress(nftMint);
        
        const result = await provider.get('get_vesting_state', builder.build());
        return {
            totalAmount: result.stack.readBigNumber(),
            releasedAmount: result.stack.readBigNumber(),
            vestedAmount: result.stack.readBigNumber(),
            startTimestamp: result.stack.readNumber(),
            endTimestamp: result.stack.readNumber(),
            lastClaimedTimestamp: result.stack.readNumber(),
        };
    }

    async getIsPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_is_paused', []);
        return result.stack.readNumber() === 1;
    }

    // ===============================================
    // Utility Functions
    // ===============================================

    static calculateTax(amount: bigint, taxRateBps: number): bigint {
        return (amount * BigInt(taxRateBps)) / 10000n;
    }

    static calculateVestedAmount(
        totalAmount: bigint,
        startTimestamp: number,
        endTimestamp: number,
        currentTime: number
    ): bigint {
        if (currentTime >= endTimestamp) {
            return totalAmount;
        }

        const elapsed = currentTime - startTimestamp;
        const duration = endTimestamp - startTimestamp;

        if (duration === 0) {
            return 0n;
        }

        return (totalAmount * BigInt(elapsed)) / BigInt(duration);
    }

    static buildMerkleProof(proofElements: Buffer[]): Cell {
        let proofCell = beginCell().endCell();
        
        for (let i = proofElements.length - 1; i >= 0; i--) {
            proofCell = beginCell()
                .storeBuffer(proofElements[i])
                .storeRef(proofCell)
                .endCell();
        }
        
        return proofCell;
    }

    static getTierName(tier: Tier): string {
        const names: Record<Tier, string> = {
            [Tier.OG]: 'OG',
            [Tier.TRAIN]: 'Train',
            [Tier.BOAT]: 'Boat',
            [Tier.PLANE]: 'Plane',
            [Tier.ROCKET]: 'Rocket',
        };
        return names[tier];
    }

    static getBonusRangeForTier(tier: Tier): TierBonusRange {
        return TIER_BONUS_RANGES[tier];
    }

    static formatBasisPoints(bps: number): string {
        return `${(bps / 100).toFixed(2)}%`;
    }

    static canResetTax(lastSwapTimestamp: number): boolean {
        const now = Math.floor(Date.now() / 1000);
        return now - lastSwapTimestamp >= CONSTANTS.TAX_RESET_DURATION;
    }

    static isInCliffPeriod(vestingStartTimestamp: number): boolean {
        const now = Math.floor(Date.now() / 1000);
        return now < vestingStartTimestamp + CONSTANTS.CLIFF_DURATION;
    }

    static calculateNextTaxRate(currentTaxBps: number): number {
        return Math.min(
            currentTaxBps + CONSTANTS.TAX_INCREMENT_BPS,
            CONSTANTS.TAX_CAP_BPS
        );
    }
}