#!/usr/bin/env node

/**
 * Simplified test runner for DeFAI Swap contract
 * Validates core logic and functionality
 */

const fs = require('fs');
const path = require('path');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Test assertion helper
function assert(condition, message) {
    totalTests++;
    if (condition) {
        console.log(`${colors.green}✓${colors.reset} ${message}`);
        passedTests++;
        return true;
    } else {
        console.log(`${colors.red}✗${colors.reset} ${message}`);
        failedTests++;
        return false;
    }
}

// Test section helper
function describe(name, fn) {
    console.log(`\n${colors.blue}${name}${colors.reset}`);
    fn();
}

// Individual test helper
function it(name, fn) {
    try {
        fn();
    } catch (error) {
        totalTests++;
        failedTests++;
        console.log(`${colors.red}✗${colors.reset} ${name}`);
        console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
    }
}

// Mock implementations for testing
class MockDefaiSwap {
    constructor() {
        this.config = {
            admin: 'admin_address',
            oldMint: 'old_mint_address',
            newMint: 'new_mint_address',
            collection: 'collection_address',
            treasury: 'treasury_address',
            prices: [100n, 200n, 300n, 400n, 500n],
            paused: false,
            vrfEnabled: false
        };
        
        this.taxStates = new Map();
        this.bonusStates = new Map();
        this.vestingStates = new Map();
        this.constants = {
            INITIAL_TAX_BPS: 500,
            TAX_INCREMENT_BPS: 100,
            TAX_CAP_BPS: 3000,
            TAX_RESET_DURATION: 86400,
            VESTING_DURATION: 7776000,
            CLIFF_DURATION: 172800
        };
    }
    
    getUserTaxState(address) {
        if (!this.taxStates.has(address)) {
            return {
                taxRateBps: this.constants.INITIAL_TAX_BPS,
                lastSwapTimestamp: 0,
                swapCount: 0
            };
        }
        return this.taxStates.get(address);
    }
    
    updateUserTaxState(address) {
        let state = this.getUserTaxState(address);
        state.taxRateBps = Math.min(
            state.taxRateBps + this.constants.TAX_INCREMENT_BPS,
            this.constants.TAX_CAP_BPS
        );
        state.swapCount++;
        state.lastSwapTimestamp = Date.now() / 1000;
        this.taxStates.set(address, state);
        return state;
    }
    
    calculateTax(amount, taxRateBps) {
        return (amount * BigInt(taxRateBps)) / 10000n;
    }
    
    calculateVestedAmount(totalAmount, startTime, endTime, currentTime) {
        if (currentTime >= endTime) {
            return totalAmount;
        }
        const elapsed = currentTime - startTime;
        const duration = endTime - startTime;
        if (duration === 0) return 0n;
        return (totalAmount * BigInt(elapsed)) / BigInt(duration);
    }
    
    getTierBonusRange(tier) {
        const ranges = [
            { min: 0, max: 0 },        // OG
            { min: 0, max: 1500 },     // Train
            { min: 1500, max: 5000 },  // Boat
            { min: 2000, max: 10000 }, // Plane
            { min: 5000, max: 30000 }  // Rocket
        ];
        return ranges[tier] || { min: 0, max: 0 };
    }
    
    generateRandomBonus(tier) {
        const range = this.getTierBonusRange(tier);
        if (range.min === range.max) return range.min;
        // Simple pseudo-random for testing
        return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
    }
    
    swapDefaiForNft(user, tier, amount) {
        if (this.config.paused) {
            throw new Error('Protocol is paused');
        }
        if (tier >= 5) {
            throw new Error('Invalid tier');
        }
        
        const price = this.config.prices[tier];
        if (amount < price) {
            throw new Error('Insufficient amount');
        }
        
        const taxState = this.getUserTaxState(user);
        const taxAmount = this.calculateTax(price, taxState.taxRateBps);
        const netAmount = price - taxAmount;
        
        const bonus = this.generateRandomBonus(tier);
        const vestingAmount = (price * BigInt(bonus)) / 10000n;
        
        // Create NFT (using user address as NFT ID for simplicity)
        const nftId = `${user}_nft_${Date.now()}`;
        
        this.bonusStates.set(nftId, {
            tier,
            bonusBps: bonus,
            vestingStart: Date.now() / 1000,
            vestingDuration: this.constants.VESTING_DURATION,
            claimed: false,
            feeDeducted: 0n
        });
        
        this.vestingStates.set(nftId, {
            totalAmount: vestingAmount,
            releasedAmount: 0n,
            startTimestamp: Date.now() / 1000,
            endTimestamp: Date.now() / 1000 + this.constants.VESTING_DURATION,
            lastClaimedTimestamp: Date.now() / 1000
        });
        
        this.updateUserTaxState(user);
        
        return {
            success: true,
            nftId,
            tier,
            price,
            taxAmount,
            bonusBps: bonus
        };
    }
    
    redeem(user, nftId) {
        if (!this.bonusStates.has(nftId)) {
            throw new Error('NFT not found');
        }
        
        const bonusState = this.bonusStates.get(nftId);
        if (bonusState.claimed) {
            throw new Error('NFT already redeemed');
        }
        
        const tier = bonusState.tier;
        const basePrice = this.config.prices[tier];
        const amountToReturn = basePrice - bonusState.feeDeducted;
        
        bonusState.claimed = true;
        this.bonusStates.set(nftId, bonusState);
        
        return {
            success: true,
            amountReturned: amountToReturn,
            feeDeducted: bonusState.feeDeducted
        };
    }
    
    claimVested(user, nftId, currentTime) {
        if (!this.vestingStates.has(nftId)) {
            throw new Error('Vesting not found');
        }
        
        const vesting = this.vestingStates.get(nftId);
        const cliffEnd = vesting.startTimestamp + this.constants.CLIFF_DURATION;
        
        if (currentTime < cliffEnd) {
            throw new Error('Still in cliff period');
        }
        
        const vestedAmount = this.calculateVestedAmount(
            vesting.totalAmount,
            vesting.startTimestamp,
            vesting.endTimestamp,
            currentTime
        );
        
        const claimable = vestedAmount - vesting.releasedAmount;
        if (claimable <= 0n) {
            throw new Error('Nothing to claim');
        }
        
        vesting.releasedAmount += claimable;
        vesting.lastClaimedTimestamp = currentTime;
        this.vestingStates.set(nftId, vesting);
        
        return {
            success: true,
            amountClaimed: claimable,
            totalVested: vestedAmount
        };
    }
}

// Run tests
console.log(`${colors.yellow}DeFAI Swap Contract Test Suite${colors.reset}`);
console.log('=' . repeat(40));

const contract = new MockDefaiSwap();

describe('Configuration Tests', () => {
    it('should have correct initial config', () => {
        assert(contract.config.admin === 'admin_address', 'Admin address set correctly');
        assert(contract.config.prices.length === 5, 'All 5 tier prices configured');
        assert(contract.config.paused === false, 'Contract not paused initially');
    });
    
    it('should have correct constants', () => {
        assert(contract.constants.INITIAL_TAX_BPS === 500, 'Initial tax is 5%');
        assert(contract.constants.TAX_CAP_BPS === 3000, 'Tax cap is 30%');
        assert(contract.constants.VESTING_DURATION === 7776000, 'Vesting is 90 days');
    });
});

describe('Tax Management Tests', () => {
    it('should initialize user tax correctly', () => {
        const taxState = contract.getUserTaxState('user1');
        assert(taxState.taxRateBps === 500, 'Initial tax rate is 5%');
        assert(taxState.swapCount === 0, 'Initial swap count is 0');
    });
    
    it('should increment tax after swap', () => {
        const state1 = contract.updateUserTaxState('user2');
        assert(state1.taxRateBps === 600, 'Tax increased to 6%');
        assert(state1.swapCount === 1, 'Swap count is 1');
        
        const state2 = contract.updateUserTaxState('user2');
        assert(state2.taxRateBps === 700, 'Tax increased to 7%');
        assert(state2.swapCount === 2, 'Swap count is 2');
    });
    
    it('should cap tax at maximum', () => {
        let state = contract.getUserTaxState('user3');
        for (let i = 0; i < 30; i++) {
            state = contract.updateUserTaxState('user3');
        }
        assert(state.taxRateBps === 3000, 'Tax capped at 30%');
    });
    
    it('should calculate tax correctly', () => {
        const amount = 1000n;
        const tax5 = contract.calculateTax(amount, 500);
        assert(tax5 === 50n, '5% of 1000 is 50');
        
        const tax30 = contract.calculateTax(amount, 3000);
        assert(tax30 === 300n, '30% of 1000 is 300');
    });
});

describe('Swap Operations Tests', () => {
    it('should perform swap successfully', () => {
        const result = contract.swapDefaiForNft('user4', 1, 250n); // Tier 1 (Train)
        assert(result.success === true, 'Swap successful');
        assert(result.tier === 1, 'Correct tier');
        assert(result.price === 200n, 'Correct price');
        assert(result.bonusBps >= 0 && result.bonusBps <= 1500, 'Bonus in valid range');
    });
    
    it('should reject swap with invalid tier', () => {
        let failed = false;
        try {
            contract.swapDefaiForNft('user5', 10, 1000n);
        } catch (e) {
            failed = true;
        }
        assert(failed, 'Invalid tier rejected');
    });
    
    it('should reject swap when paused', () => {
        contract.config.paused = true;
        let failed = false;
        try {
            contract.swapDefaiForNft('user6', 0, 100n);
        } catch (e) {
            failed = true;
        }
        assert(failed, 'Swap rejected when paused');
        contract.config.paused = false;
    });
    
    it('should create vesting state after swap', () => {
        const result = contract.swapDefaiForNft('user7', 2, 350n); // Tier 2 (Boat)
        const vesting = contract.vestingStates.get(result.nftId);
        assert(vesting !== undefined, 'Vesting state created');
        assert(vesting.totalAmount > 0n, 'Vesting amount set');
        assert(vesting.releasedAmount === 0n, 'No amount released initially');
    });
});

describe('Redemption Tests', () => {
    it('should redeem NFT successfully', () => {
        const swapResult = contract.swapDefaiForNft('user8', 3, 450n); // Tier 3 (Plane)
        const redeemResult = contract.redeem('user8', swapResult.nftId);
        assert(redeemResult.success === true, 'Redemption successful');
        assert(redeemResult.amountReturned === 400n, 'Correct amount returned');
    });
    
    it('should reject double redemption', () => {
        const swapResult = contract.swapDefaiForNft('user9', 0, 150n);
        contract.redeem('user9', swapResult.nftId);
        
        let failed = false;
        try {
            contract.redeem('user9', swapResult.nftId);
        } catch (e) {
            failed = true;
        }
        assert(failed, 'Double redemption rejected');
    });
});

describe('Vesting Tests', () => {
    it('should calculate vested amount correctly', () => {
        const total = 1000n;
        const start = 1000;
        const end = 2000;
        
        const vested0 = contract.calculateVestedAmount(total, start, end, 1000);
        assert(vested0 === 0n, '0% vested at start');
        
        const vested50 = contract.calculateVestedAmount(total, start, end, 1500);
        assert(vested50 === 500n, '50% vested at midpoint');
        
        const vested100 = contract.calculateVestedAmount(total, start, end, 2000);
        assert(vested100 === 1000n, '100% vested at end');
    });
    
    it('should reject claim during cliff period', () => {
        const swapResult = contract.swapDefaiForNft('user10', 1, 250n);
        const currentTime = Date.now() / 1000;
        
        let failed = false;
        try {
            contract.claimVested('user10', swapResult.nftId, currentTime + 3600); // 1 hour later
        } catch (e) {
            failed = true;
        }
        assert(failed, 'Claim rejected during cliff');
    });
    
    it('should allow claim after cliff period', () => {
        const swapResult = contract.swapDefaiForNft('user11', 2, 350n);
        const currentTime = Date.now() / 1000;
        const afterCliff = currentTime + contract.constants.CLIFF_DURATION + 1;
        
        const claimResult = contract.claimVested('user11', swapResult.nftId, afterCliff);
        assert(claimResult.success === true, 'Claim successful after cliff');
        assert(claimResult.amountClaimed > 0n, 'Amount claimed is positive');
    });
});

describe('Bonus Range Tests', () => {
    it('should return correct bonus ranges', () => {
        const og = contract.getTierBonusRange(0);
        assert(og.min === 0 && og.max === 0, 'OG tier has no bonus');
        
        const rocket = contract.getTierBonusRange(4);
        assert(rocket.min === 5000 && rocket.max === 30000, 'Rocket tier range 50%-300%');
    });
    
    it('should generate bonus within range', () => {
        for (let tier = 0; tier < 5; tier++) {
            const bonus = contract.generateRandomBonus(tier);
            const range = contract.getTierBonusRange(tier);
            assert(
                bonus >= range.min && bonus <= range.max,
                `Tier ${tier} bonus ${bonus} within range [${range.min}, ${range.max}]`
            );
        }
    });
});

// Check FunC contract file exists
describe('Contract Files', () => {
    it('should have FunC contract file', () => {
        const funcFile = path.join(__dirname, 'defai_swap.fc');
        const exists = fs.existsSync(funcFile);
        assert(exists, 'defai_swap.fc exists');
        
        if (exists) {
            const content = fs.readFileSync(funcFile, 'utf8');
            assert(content.includes('op::initialize'), 'Contract has initialize operation');
            assert(content.includes('op::swap_defai_for_nft'), 'Contract has swap operation');
            assert(content.includes('op::redeem'), 'Contract has redeem operation');
            assert(content.includes('op::claim_vested'), 'Contract has claim operation');
        }
    });
    
    it('should have TypeScript wrapper', () => {
        const wrapperFile = path.join(__dirname, 'defai_swap_wrapper.ts');
        const exists = fs.existsSync(wrapperFile);
        assert(exists, 'defai_swap_wrapper.ts exists');
        
        if (exists) {
            const content = fs.readFileSync(wrapperFile, 'utf8');
            assert(content.includes('class DefaiSwap'), 'Wrapper has DefaiSwap class');
            assert(content.includes('sendSwapDefaiForNft'), 'Wrapper has swap method');
            assert(content.includes('sendRedeem'), 'Wrapper has redeem method');
        }
    });
    
    it('should have test file', () => {
        const testFile = path.join(__dirname, 'defai_swap.spec.ts');
        const exists = fs.existsSync(testFile);
        assert(exists, 'defai_swap.spec.ts exists');
        
        if (exists) {
            const content = fs.readFileSync(testFile, 'utf8');
            assert(content.includes("describe('DeFAI Swap Contract'"), 'Test suite defined');
            assert(content.includes("describe('Initialization'"), 'Has initialization tests');
            assert(content.includes("describe('Swap Operations'"), 'Has swap tests');
        }
    });
});

// Print results
console.log('\n' + '=' . repeat(40));
console.log(`${colors.blue}Test Results:${colors.reset}`);
console.log(`Total Tests: ${totalTests}`);
console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);

if (failedTests === 0) {
    console.log(`\n${colors.green}✨ All tests passed!${colors.reset}`);
    process.exit(0);
} else {
    console.log(`\n${colors.red}❌ Some tests failed.${colors.reset}`);
    process.exit(1);
}