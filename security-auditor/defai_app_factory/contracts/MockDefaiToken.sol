// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockDefaiToken
 * @dev Mock DEFAI token for testing purposes
 * @notice In production, replace with actual DEFAI token address
 */
contract MockDefaiToken is ERC20, Ownable {
    uint8 private constant DECIMALS = 6; // Matching Solana's 6 decimals

    constructor() ERC20("DEFAI Token", "DEFAI") {
        // Mint initial supply to deployer
        _mint(msg.sender, 1000000000 * 10**DECIMALS); // 1 billion tokens
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @dev Mint tokens (only for testing)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Faucet for testing - anyone can get test tokens
     */
    function faucet() external {
        _mint(msg.sender, 10000 * 10**DECIMALS); // 10,000 DEFAI
    }
}