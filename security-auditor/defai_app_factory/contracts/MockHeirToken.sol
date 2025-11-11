// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockHeirToken is ERC20, Ownable {
    uint8 private constant _decimals = 6;
    uint256 public constant TOTAL_SUPPLY = 100_000_000_000 * 10**6; // 100 billion with 6 decimals
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10**6; // 10,000 HEIR tokens per faucet request
    
    mapping(address => uint256) public lastFaucetTime;
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    constructor() ERC20("Mock Heir Token", "HEIR") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    function faucet() public {
        require(
            block.timestamp >= lastFaucetTime[msg.sender] + FAUCET_COOLDOWN,
            "Please wait 24 hours between faucet requests"
        );
        
        lastFaucetTime[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function resetFaucetCooldown(address user) public onlyOwner {
        lastFaucetTime[user] = 0;
    }
}