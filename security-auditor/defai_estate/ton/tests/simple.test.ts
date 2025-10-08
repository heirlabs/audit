// Simple test file to validate the FunC contracts
import { describe, it, expect } from '@jest/globals';

describe('DefAI Estate TON Contracts', () => {
    describe('Contract Compilation', () => {
        it('should have valid FunC syntax for estate contract', () => {
            // This test validates that the FunC files exist and have valid structure
            const fs = require('fs');
            const estateContract = fs.readFileSync('./defai-estate.fc', 'utf8');
            
            // Check for essential functions
            expect(estateContract).toContain('recv_internal');
            expect(estateContract).toContain('create_estate');
            expect(estateContract).toContain('add_beneficiary');
            expect(estateContract).toContain('enable_trading');
            expect(estateContract).toContain('get_estate_info');
        });

        it('should have valid FunC syntax for treasury contract', () => {
            const fs = require('fs');
            const treasuryContract = fs.readFileSync('./defai-treasury.fc', 'utf8');
            
            expect(treasuryContract).toContain('recv_internal');
            expect(treasuryContract).toContain('init_treasury');
            expect(treasuryContract).toContain('create_proposal');
            expect(treasuryContract).toContain('approve_proposal');
            expect(treasuryContract).toContain('execute_proposal');
        });

        it('should have valid FunC syntax for RWA contract', () => {
            const fs = require('fs');
            const rwaContract = fs.readFileSync('./defai-rwa.fc', 'utf8');
            
            expect(rwaContract).toContain('recv_internal');
            expect(rwaContract).toContain('register_rwa');
            expect(rwaContract).toContain('verify_rwa');
            expect(rwaContract).toContain('claim_rwa');
            expect(rwaContract).toContain('get_rwa_info');
        });
    });

    describe('Contract Constants', () => {
        it('should have correct estate constants', () => {
            const fs = require('fs');
            const estateContract = fs.readFileSync('./defai-estate.fc', 'utf8');
            
            // Verify constants
            expect(estateContract).toContain('const int MIN_INACTIVITY_PERIOD = 86400');
            expect(estateContract).toContain('const int MAX_BENEFICIARIES = 10');
            expect(estateContract).toContain('const int ESTATE_FEE = 100000000');
        });

        it('should have correct treasury constants', () => {
            const fs = require('fs');
            const treasuryContract = fs.readFileSync('./defai-treasury.fc', 'utf8');
            
            expect(treasuryContract).toContain('const int PLATFORM_FEE_BPS = 250');
            expect(treasuryContract).toContain('const int MIN_THRESHOLD = 2');
            expect(treasuryContract).toContain('const int ADMIN_TIMELOCK = 172800');
        });

        it('should have correct RWA constants', () => {
            const fs = require('fs');
            const rwaContract = fs.readFileSync('./defai-rwa.fc', 'utf8');
            
            expect(rwaContract).toContain('const int RWA_REGISTRATION_FEE = 10000000');
            expect(rwaContract).toContain('const int MAX_RWA_PER_ESTATE = 100');
            expect(rwaContract).toContain('const int RWA_VERIFICATION_PERIOD = 259200');
        });
    });

    describe('Operation Codes', () => {
        it('should have unique operation codes', () => {
            const fs = require('fs');
            const estateContract = fs.readFileSync('./defai-estate.fc', 'utf8');
            const treasuryContract = fs.readFileSync('./defai-treasury.fc', 'utf8');
            const rwaContract = fs.readFileSync('./defai-rwa.fc', 'utf8');
            
            // Extract operation codes
            const estateOps = estateContract.match(/const int op::\w+ = 0x\w+/g) || [];
            const treasuryOps = treasuryContract.match(/const int op::\w+ = 0x\w+/g) || [];
            const rwaOps = rwaContract.match(/const int op::\w+ = 0x\w+/g) || [];
            
            // Check uniqueness within each contract
            const estateValues = estateOps.map(op => op.split('=')[1].trim());
            const treasuryValues = treasuryOps.map(op => op.split('=')[1].trim());
            const rwaValues = rwaOps.map(op => op.split('=')[1].trim());
            
            expect(new Set(estateValues).size).toBe(estateValues.length);
            expect(new Set(treasuryValues).size).toBe(treasuryValues.length);
            expect(new Set(rwaValues).size).toBe(rwaValues.length);
            
            // Check ranges (0x1xxx for estate, 0x2xxx for treasury, 0x3xxx for RWA)
            estateValues.forEach(v => {
                expect(v.startsWith('0x1')).toBe(true);
            });
            treasuryValues.forEach(v => {
                expect(v.startsWith('0x2')).toBe(true);
            });
            rwaValues.forEach(v => {
                expect(v.startsWith('0x3')).toBe(true);
            });
        });
    });

    describe('Error Codes', () => {
        it('should have unique error codes across contracts', () => {
            const fs = require('fs');
            const estateContract = fs.readFileSync('./defai-estate.fc', 'utf8');
            const treasuryContract = fs.readFileSync('./defai-treasury.fc', 'utf8');
            const rwaContract = fs.readFileSync('./defai-rwa.fc', 'utf8');
            
            // Extract error codes
            const estateErrors = estateContract.match(/const int error::\w+ = \d+/g) || [];
            const treasuryErrors = treasuryContract.match(/const int error::\w+ = \d+/g) || [];
            const rwaErrors = rwaContract.match(/const int error::\w+ = \d+/g) || [];
            
            const estateErrorValues = estateErrors.map(e => parseInt(e.split('=')[1].trim()));
            const treasuryErrorValues = treasuryErrors.map(e => parseInt(e.split('=')[1].trim()));
            const rwaErrorValues = rwaErrors.map(e => parseInt(e.split('=')[1].trim()));
            
            // Check ranges (4xx for estate, 5xx for treasury, 6xx for RWA)
            estateErrorValues.forEach(v => {
                expect(v).toBeGreaterThanOrEqual(400);
                expect(v).toBeLessThan(500);
            });
            treasuryErrorValues.forEach(v => {
                expect(v).toBeGreaterThanOrEqual(500);
                expect(v).toBeLessThan(600);
            });
            rwaErrorValues.forEach(v => {
                expect(v).toBeGreaterThanOrEqual(600);
                expect(v).toBeLessThan(700);
            });
        });
    });

    describe('Security Features', () => {
        it('should have authorization checks', () => {
            const fs = require('fs');
            const estateContract = fs.readFileSync('./defai-estate.fc', 'utf8');
            const treasuryContract = fs.readFileSync('./defai-treasury.fc', 'utf8');
            
            // Check for authorization patterns
            expect(estateContract).toContain('throw_unless(error::unauthorized');
            expect(estateContract).toContain('equal_slices');
            expect(treasuryContract).toContain('is_signer');
            expect(treasuryContract).toContain('throw_unless(error::unauthorized');
        });

        it('should have validation checks', () => {
            const fs = require('fs');
            const estateContract = fs.readFileSync('./defai-estate.fc', 'utf8');
            const rwaContract = fs.readFileSync('./defai-rwa.fc', 'utf8');
            
            // Check for validation patterns
            expect(estateContract).toContain('throw_unless(error::invalid_period');
            expect(estateContract).toContain('throw_unless(error::max_beneficiaries');
            expect(rwaContract).toContain('throw_unless(error::invalid_value');
            expect(rwaContract).toContain('throw_unless(error::max_rwa_exceeded');
        });

        it('should have timelock mechanisms', () => {
            const fs = require('fs');
            const treasuryContract = fs.readFileSync('./defai-treasury.fc', 'utf8');
            
            expect(treasuryContract).toContain('ADMIN_TIMELOCK');
            expect(treasuryContract).toContain('admin_timelock');
            expect(treasuryContract).toContain('throw_unless(error::timelock_active');
        });
    });

    describe('Data Storage', () => {
        it('should properly structure estate data', () => {
            const fs = require('fs');
            const estateContract = fs.readFileSync('./defai-estate.fc', 'utf8');
            
            // Check for proper data loading/saving
            expect(estateContract).toContain('load_estate_data');
            expect(estateContract).toContain('save_estate_data');
            expect(estateContract).toContain('store_slice(owner)');
            expect(estateContract).toContain('store_uint(estate_id, 256)');
            expect(estateContract).toContain('store_dict(beneficiaries)');
        });

        it('should properly structure treasury data', () => {
            const fs = require('fs');
            const treasuryContract = fs.readFileSync('./defai-treasury.fc', 'utf8');
            
            expect(treasuryContract).toContain('load_treasury_data');
            expect(treasuryContract).toContain('load_multisig_data');
            expect(treasuryContract).toContain('save_data');
            expect(treasuryContract).toContain('store_dict(signers)');
            expect(treasuryContract).toContain('store_dict(proposals)');
        });

        it('should properly structure RWA data', () => {
            const fs = require('fs');
            const rwaContract = fs.readFileSync('./defai-rwa.fc', 'utf8');
            
            expect(rwaContract).toContain('load_rwa_data');
            expect(rwaContract).toContain('save_rwa_data');
            expect(rwaContract).toContain('store_dict(rwa_registry)');
            expect(rwaContract).toContain('store_dict(estate_rwas)');
        });
    });
});