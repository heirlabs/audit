import { Cell, beginCell, Address } from '@ton/core';

// Contract operation codes
export const OP = {
    // Estate operations
    CREATE_ESTATE: 0x1001,
    ADD_BENEFICIARY: 0x1002,
    REMOVE_BENEFICIARY: 0x1003,
    UPDATE_ACTIVITY: 0x1004,
    CLAIM_ESTATE: 0x1005,
    ADD_RWA: 0x1006,
    ENABLE_TRADING: 0x1007,
    PAUSE_TRADING: 0x1008,
    RESUME_TRADING: 0x1009,
    DEPOSIT_FUNDS: 0x100a,
    WITHDRAW_FUNDS: 0x100b,
    EMERGENCY_WITHDRAW: 0x100c,
    UPDATE_TRADING: 0x100d,

    // Treasury operations
    INIT_TREASURY: 0x2001,
    COLLECT_FEES: 0x2002,
    CREATE_PROPOSAL: 0x2003,
    APPROVE_PROPOSAL: 0x2004,
    EXECUTE_PROPOSAL: 0x2005,
    CANCEL_PROPOSAL: 0x2006,
    UPDATE_SIGNERS: 0x2007,
    EMERGENCY_PAUSE: 0x2008,
    EMERGENCY_RESUME: 0x2009,
    WITHDRAW_TREASURY: 0x200a,
    UPDATE_FEE: 0x200b,
    PROPOSE_ADMIN: 0x200c,
    ACCEPT_ADMIN: 0x200d,

    // RWA operations
    REGISTER_RWA: 0x3001,
    VERIFY_RWA: 0x3002,
    UPDATE_RWA_VALUE: 0x3003,
    TRANSFER_RWA: 0x3004,
    REMOVE_RWA: 0x3005,
    CLAIM_RWA: 0x3006,
    UPDATE_METADATA: 0x3007,
    BATCH_REGISTER: 0x3008,
};

// Contract extensions for testing
export function extendContract(contract: any) {
    // Estate contract methods
    contract.sendCreateEstate = async (sender: any, inactivityPeriod: number, gracePeriod: number, estateNumber: number) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.05'),
            body: beginCell()
                .storeUint(OP.CREATE_ESTATE, 32)
                .storeUint(0, 64) // query_id
                .storeUint(inactivityPeriod, 64)
                .storeUint(gracePeriod, 64)
                .storeUint(estateNumber, 64)
                .endCell()
        });
    };

    contract.sendAddBeneficiary = async (sender: any, beneficiary: Address, share: number) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.05'),
            body: beginCell()
                .storeUint(OP.ADD_BENEFICIARY, 32)
                .storeUint(0, 64)
                .storeAddress(beneficiary)
                .storeUint(share, 32)
                .endCell()
        });
    };

    contract.sendEnableTrading = async (sender: any, aiAgent: Address, humanShare: number, strategy: number, stopLoss: number, emergencyDelay: number) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.05'),
            body: beginCell()
                .storeUint(OP.ENABLE_TRADING, 32)
                .storeUint(0, 64)
                .storeAddress(aiAgent)
                .storeUint(humanShare, 8)
                .storeUint(strategy, 8)
                .storeUint(stopLoss, 8)
                .storeUint(emergencyDelay, 32)
                .endCell()
        });
    };

    contract.sendDeposit = async (sender: any, amount: bigint) => {
        return await contract.sendMessage(sender, {
            value: amount,
            body: beginCell()
                .storeUint(OP.DEPOSIT_FUNDS, 32)
                .storeUint(0, 64)
                .endCell()
        });
    };

    contract.sendUpdateActivity = async (sender: any) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.UPDATE_ACTIVITY, 32)
                .storeUint(0, 64)
                .endCell()
        });
    };

    // Treasury contract methods
    contract.sendInitTreasury = async (sender: any, admin: Address, signersCell: Cell, threshold: number) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.05'),
            body: beginCell()
                .storeUint(OP.INIT_TREASURY, 32)
                .storeUint(0, 64)
                .storeAddress(admin)
                .storeRef(signersCell)
                .storeUint(threshold, 8)
                .endCell()
        });
    };

    contract.sendCollectFees = async (sender: any, estateId: number, amount: bigint) => {
        return await contract.sendMessage(sender, {
            value: amount,
            body: beginCell()
                .storeUint(OP.COLLECT_FEES, 32)
                .storeUint(0, 64)
                .storeUint(estateId, 256)
                .endCell()
        });
    };

    contract.sendCreateProposal = async (sender: any, proposalType: number, target: Address, amount: bigint, data: Cell) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.05'),
            body: beginCell()
                .storeUint(OP.CREATE_PROPOSAL, 32)
                .storeUint(0, 64)
                .storeUint(proposalType, 8)
                .storeAddress(target)
                .storeCoins(amount)
                .storeRef(data)
                .endCell()
        });
    };

    contract.sendApproveProposal = async (sender: any, proposalId: number) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.APPROVE_PROPOSAL, 32)
                .storeUint(0, 64)
                .storeUint(proposalId, 32)
                .endCell()
        });
    };

    contract.sendExecuteProposal = async (sender: any, proposalId: number) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.EXECUTE_PROPOSAL, 32)
                .storeUint(0, 64)
                .storeUint(proposalId, 32)
                .endCell()
        });
    };

    contract.sendProposeAdminChange = async (sender: any, newAdmin: Address) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.PROPOSE_ADMIN, 32)
                .storeUint(0, 64)
                .storeAddress(newAdmin)
                .endCell()
        });
    };

    contract.sendAcceptAdminChange = async (sender: any) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.ACCEPT_ADMIN, 32)
                .storeUint(0, 64)
                .endCell()
        });
    };

    contract.sendEmergencyPause = async (sender: any) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.EMERGENCY_PAUSE, 32)
                .storeUint(0, 64)
                .endCell()
        });
    };

    // RWA contract methods
    contract.sendRegisterRWA = async (sender: any, estateId: number, rwaType: number, value: bigint, metadataHash: bigint, fee: bigint) => {
        return await contract.sendMessage(sender, {
            value: fee,
            body: beginCell()
                .storeUint(OP.REGISTER_RWA, 32)
                .storeUint(0, 64)
                .storeUint(estateId, 256)
                .storeUint(rwaType, 8)
                .storeCoins(value)
                .storeUint(metadataHash, 256)
                .endCell()
        });
    };

    contract.sendVerifyRWA = async (sender: any, rwaId: number) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.VERIFY_RWA, 32)
                .storeUint(0, 64)
                .storeUint(rwaId, 64)
                .endCell()
        });
    };

    contract.sendUpdateRWAValue = async (sender: any, rwaId: number, newValue: bigint) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.UPDATE_RWA_VALUE, 32)
                .storeUint(0, 64)
                .storeUint(rwaId, 64)
                .storeCoins(newValue)
                .endCell()
        });
    };

    contract.sendClaimRWA = async (sender: any, rwaId: number, estateClaimable: boolean) => {
        return await contract.sendMessage(sender, {
            value: toNano('0.01'),
            body: beginCell()
                .storeUint(OP.CLAIM_RWA, 32)
                .storeUint(0, 64)
                .storeUint(rwaId, 64)
                .storeUint(estateClaimable ? 1 : 0, 1)
                .endCell()
        });
    };

    contract.sendBatchRegister = async (sender: any, estateId: number, rwaList: Cell, fee: bigint) => {
        return await contract.sendMessage(sender, {
            value: fee,
            body: beginCell()
                .storeUint(OP.BATCH_REGISTER, 32)
                .storeUint(0, 64)
                .storeUint(estateId, 256)
                .storeRef(rwaList)
                .endCell()
        });
    };

    // Get methods
    contract.getEstateInfo = async () => {
        const result = await contract.runGetMethod('get_estate_info');
        return {
            estate_number: result.stack.readNumber(),
            owner: result.stack.readAddress(),
            estate_value: result.stack.readNumber(),
            last_active: result.stack.readNumber(),
            inactivity_period: result.stack.readNumber(),
            grace_period: result.stack.readNumber(),
            is_locked: result.stack.readBoolean(),
            is_claimable: result.stack.readBoolean(),
        };
    };

    contract.getTradingStatus = async () => {
        const result = await contract.runGetMethod('get_trading_status');
        return result.stack.readNumber();
    };

    contract.getBeneficiaries = async () => {
        const result = await contract.runGetMethod('get_beneficiaries');
        return result.stack.readCell();
    };

    contract.getTreasuryInfo = async () => {
        const result = await contract.runGetMethod('get_treasury_info');
        return {
            total_collected: result.stack.readNumber(),
            platform_fee_bps: result.stack.readNumber(),
            paused: result.stack.readBoolean(),
            proposal_count: result.stack.readNumber(),
        };
    };

    contract.getMultisigInfo = async () => {
        const result = await contract.runGetMethod('get_multisig_info');
        return {
            threshold: result.stack.readNumber(),
            signer_count: result.stack.readNumber(),
            proposal_count: result.stack.readNumber(),
        };
    };

    contract.isSignerMethod = async (address: Address) => {
        const result = await contract.runGetMethod('is_signer_method', [
            { type: 'slice', cell: beginCell().storeAddress(address).endCell() }
        ]);
        return result.stack.readBoolean();
    };

    contract.getRWAInfo = async (rwaId: number) => {
        const result = await contract.runGetMethod('get_rwa_info', [
            { type: 'int', value: BigInt(rwaId) }
        ]);
        return {
            estate_id: result.stack.readNumber(),
            rwa_type: result.stack.readNumber(),
            owner: result.stack.readAddress(),
            value: result.stack.readNumber(),
            status: result.stack.readNumber(),
            exists: result.stack.readBoolean(),
        };
    };

    contract.getRegistryStats = async () => {
        const result = await contract.runGetMethod('get_registry_stats');
        return {
            rwa_counter: result.stack.readNumber(),
            total_value_locked: result.stack.readNumber(),
        };
    };

    contract.getEstateRWAs = async (estateId: number) => {
        const result = await contract.runGetMethod('get_estate_rwas', [
            { type: 'int', value: BigInt(estateId) }
        ]);
        return result.stack.readCell();
    };

    return contract;
}

// Helper to convert TON amounts
export function toNano(amount: string): bigint {
    const [whole, decimal = ''] = amount.split('.');
    const padding = '0'.repeat(9 - decimal.length);
    return BigInt(whole + decimal + padding);
}