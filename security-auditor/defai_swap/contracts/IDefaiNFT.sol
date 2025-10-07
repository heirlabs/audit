// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IDefaiNFT is IERC721 {
    function mint(address to, uint256 tokenId) external;
    function burn(uint256 tokenId) external;
    function exists(uint256 tokenId) external view returns (bool);
    function setTokenURI(uint256 tokenId, string memory uri) external;
}