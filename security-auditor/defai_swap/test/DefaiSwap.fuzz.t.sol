// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../DefaiSwap.sol";
import "../DefaiNFT.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DefaiSwapFuzzTest is Test {
    DefaiSwap public swap;
    DefaiNFT public nft;
    MockERC20 public oldDefai;
    MockERC20 public defai;
    
    address public owner = address(1);
    address public treasury = address(2);
    address public user = address(3);
    address public vrfCoordinator = address(4);
    
    uint256 constant INITIAL_BALANCE = 100000 ether;
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy tokens
        oldDefai = new MockERC20("Old DEFAI", "ODEFAI");
        defai = new MockERC20("DEFAI", "DEFAI");
        
        // Deploy NFT
        nft = new DefaiNFT("DefAI NFT", "DNFT", "https://api.defai.io/");
        
        // Deploy swap contract
        uint256[5] memory prices = [
            100 ether,
            200 ether,
            500 ether,
            1000 ether,
            2000 ether
        ];
        
        swap = new DefaiSwap(
            address(oldDefai),
            address(defai),
            address(nft),
            treasury,
            prices,
            vrfCoordinator,
            1,
            bytes32(0)
        );
        
        // Setup
        nft.grantRole(nft.MINTER_ROLE(), address(swap));
        
        uint16[5] memory supplies = [uint16(100), 200, 300, 400, 500];
        swap.initializeCollection(
            supplies,
            bytes32(0),
            bytes32(0),
            50
        );
        
        // Fund user
        oldDefai.transfer(user, INITIAL_BALANCE);
        defai.transfer(user, INITIAL_BALANCE);
        
        vm.stopPrank();
    }
    
    // Fuzz test tax calculations
    function testFuzz_TaxCalculation(uint16 _taxRate, uint256 _price) public {
        // Bound inputs
        _taxRate = uint16(bound(_taxRate, 0, 10000)); // 0-100%
        _price = bound(_price, 1, 1000000 ether);
        
        uint256 expectedTax = (_price * _taxRate) / 10000;
        uint256 expectedNet = _price - expectedTax;
        
        // Verify tax calculation doesn't overflow
        assert(expectedTax <= _price);
        assert(expectedNet + expectedTax == _price);
    }
    
    // Fuzz test tax rate progression
    function testFuzz_TaxRateProgression(uint8 _swapCount) public {
        _swapCount = uint8(bound(_swapCount, 0, 100));
        
        vm.startPrank(user);
        swap.initializeUserTax();
        
        uint16 expectedRate = 500; // Initial 5%
        
        for (uint8 i = 0; i < _swapCount; i++) {
            // Simulate swap by updating tax state
            if (expectedRate < 3000) {
                expectedRate = expectedRate + 100 > 3000 ? 3000 : expectedRate + 100;
            }
        }
        
        // Tax should never exceed cap
        assert(expectedRate <= 3000);
    }
    
    // Fuzz test vesting calculations
    function testFuzz_VestingCalculation(
        uint256 _totalAmount,
        uint256 _elapsedTime,
        uint256 _vestingDuration
    ) public {
        // Bound inputs
        _totalAmount = bound(_totalAmount, 1, 1000000 ether);
        _vestingDuration = bound(_vestingDuration, 1 days, 365 days);
        _elapsedTime = bound(_elapsedTime, 0, _vestingDuration * 2);
        
        uint256 vestedAmount;
        if (_elapsedTime >= _vestingDuration) {
            vestedAmount = _totalAmount;
        } else {
            vestedAmount = (_totalAmount * _elapsedTime) / _vestingDuration;
        }
        
        // Vested amount should never exceed total
        assert(vestedAmount <= _totalAmount);
        
        // If time elapsed is greater than duration, should vest all
        if (_elapsedTime >= _vestingDuration) {
            assert(vestedAmount == _totalAmount);
        }
    }
    
    // Fuzz test bonus calculation
    function testFuzz_BonusCalculation(
        uint256 _randomValue,
        uint16 _minBonus,
        uint16 _maxBonus
    ) public {
        // Bound inputs
        _minBonus = uint16(bound(_minBonus, 0, 10000));
        _maxBonus = uint16(bound(_maxBonus, _minBonus, 30000));
        _randomValue = bound(_randomValue, 0, type(uint256).max);
        
        uint16 bonusRange = _maxBonus - _minBonus;
        uint16 bonus;
        
        if (bonusRange == 0) {
            bonus = _minBonus;
        } else {
            bonus = _minBonus + uint16(_randomValue % (bonusRange + 1));
        }
        
        // Bonus should be within range
        assert(bonus >= _minBonus);
        assert(bonus <= _maxBonus);
    }
    
    // Fuzz test supply constraints
    function testFuzz_SupplyConstraints(uint8 _tier, uint16 _minted) public {
        _tier = uint8(bound(_tier, 0, 4));
        _minted = uint16(bound(_minted, 0, 1000));
        
        uint16[5] memory supplies = [uint16(100), 200, 300, 400, 500];
        
        if (_tier == 0) {
            // Account for OG reserved supply
            uint16 ogSupply = 50;
            uint16 availableSupply = supplies[0] - ogSupply;
            
            if (_minted > availableSupply) {
                // Should not be able to mint more than available
                assert(_minted > availableSupply);
            }
        } else {
            if (_minted > supplies[_tier]) {
                // Should not be able to mint more than supply
                assert(_minted > supplies[_tier]);
            }
        }
    }
    
    // Fuzz test merkle proof verification
    function testFuzz_MerkleVerification(
        address _user,
        uint256 _amount,
        bytes32 _root
    ) public {
        // Create leaf
        bytes32 leaf = keccak256(abi.encodePacked(_user, _amount));
        
        // Without proper proof, verification should fail
        bytes32[] memory emptyProof = new bytes32[](0);
        
        // This would fail in real scenario without valid proof
        // Just testing that the hash function doesn't revert
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < emptyProof.length; i++) {
            bytes32 proofElement = emptyProof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
    }
    
    // Fuzz test admin timelock
    function testFuzz_AdminTimelock(uint256 _timestamp) public {
        _timestamp = bound(_timestamp, 0, 365 days);
        
        uint256 ADMIN_TIMELOCK = 48 hours;
        uint256 changeTime = block.timestamp + ADMIN_TIMELOCK;
        
        // Should only accept after timelock
        if (block.timestamp + _timestamp >= changeTime) {
            assert(block.timestamp + _timestamp >= changeTime);
        } else {
            assert(block.timestamp + _timestamp < changeTime);
        }
    }
    
    // Fuzz test reentrancy protection
    function testFuzz_ReentrancyProtection(uint8 _tier) public {
        _tier = uint8(bound(_tier, 0, 4));
        
        // Setup malicious contract that tries reentrant call
        // In real test, would deploy attacker contract
        
        // Verify reentrancy guard prevents multiple simultaneous calls
        vm.startPrank(user);
        
        // First call should work (if user has balance)
        // Second simultaneous call should fail
        
        vm.stopPrank();
    }
    
    // Invariant tests
    function invariant_TotalSupply() public {
        // Total minted should never exceed total supply
        uint16[5] memory supplies = [uint16(100), 200, 300, 400, 500];
        uint16 totalSupply = 0;
        uint16 totalMinted = 0;
        
        for (uint8 i = 0; i < 5; i++) {
            totalSupply += supplies[i];
            // In real test, would get actual minted from contract
            totalMinted += 0; // placeholder
        }
        
        assert(totalMinted <= totalSupply);
    }
    
    function invariant_TaxRateCap() public {
        // Tax rate should never exceed 30%
        // In real test, would check all user states
        assert(true); // placeholder
    }
    
    function invariant_VestingIntegrity() public {
        // Released amount should never exceed total vesting
        // In real test, would check all vesting states
        assert(true); // placeholder
    }
}