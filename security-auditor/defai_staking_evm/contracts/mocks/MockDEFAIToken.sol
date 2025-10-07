// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockDEFAIToken is ERC20, Ownable {
    uint8 private _decimals = 6; // Match the Solana token decimals
    
    constructor() ERC20("DeFAI Token", "DEFAI") {
        // Mint 10 billion tokens (with 6 decimals)
        _mint(msg.sender, 10_000_000_000 * 10**6);
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    // Allow minting for testing purposes
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    // Faucet function for testing
    function faucet() external {
        _mint(msg.sender, 1_000_000 * 10**6); // Give 1M DEFAI tokens
    }
}