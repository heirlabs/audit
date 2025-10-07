// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./IDefaiNFT.sol";

contract DefaiNFT is ERC721, ERC721URIStorage, ERC721Burnable, AccessControl, IDefaiNFT {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");
    
    string public baseTokenURI;
    mapping(uint8 => string) public tierURIs;
    mapping(uint256 => uint8) public tokenTiers;

    constructor(
        string memory name,
        string memory symbol,
        string memory _baseTokenURI
    ) ERC721(name, symbol) {
        baseTokenURI = _baseTokenURI;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(URI_SETTER_ROLE, msg.sender);
    }

    function mint(address to, uint256 tokenId) external override onlyRole(MINTER_ROLE) {
        _safeMint(to, tokenId);
    }

    function mintWithTier(address to, uint256 tokenId, uint8 tier) external onlyRole(MINTER_ROLE) {
        _safeMint(to, tokenId);
        tokenTiers[tokenId] = tier;
    }

    function burn(uint256 tokenId) public override(ERC721Burnable, IDefaiNFT) {
        super.burn(tokenId);
    }

    function exists(uint256 tokenId) external view override returns (bool) {
        return _exists(tokenId);
    }

    function setTokenURI(uint256 tokenId, string memory uri) external override onlyRole(URI_SETTER_ROLE) {
        _setTokenURI(tokenId, uri);
    }

    function setTierURI(uint8 tier, string memory uri) external onlyRole(URI_SETTER_ROLE) {
        tierURIs[tier] = uri;
    }

    function setBaseURI(string memory _baseTokenURI) external onlyRole(URI_SETTER_ROLE) {
        baseTokenURI = _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        
        string memory _tokenURI = super.tokenURI(tokenId);
        if (bytes(_tokenURI).length > 0) {
            return _tokenURI;
        }
        
        uint8 tier = tokenTiers[tokenId];
        if (bytes(tierURIs[tier]).length > 0) {
            return string(abi.encodePacked(tierURIs[tier], Strings.toString(tokenId)));
        }
        
        return string(abi.encodePacked(baseTokenURI, Strings.toString(tokenId)));
    }

    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721, ERC721URIStorage, AccessControl, IERC165) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
        delete tokenTiers[tokenId];
    }
}