// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IDefAIEstate {
    struct Estate {
        uint256 estateId;
        address owner;
        bytes32 ownerEmailHash;
        uint256 lastActive;
        uint256 inactivityPeriod;
        uint256 gracePeriod;
        uint256 totalBeneficiaries;
        uint256 creationTime;
        uint256 estateValue;
        bool isLocked;
        bool isClaimable;
        uint256 totalRWAs;
        uint256 estateNumber;
        uint256 totalClaims;
        bool tradingEnabled;
        address aiAgent;
        uint256 tradingStrategy;
        uint256 humanContribution;
        uint256 aiContribution;
        uint256 tradingValue;
        uint256 tradingProfit;
        uint256 highWaterMark;
        uint256 humanShare;
        uint256 aiShare;
        uint256 stopLoss;
        uint256 emergencyDelayHours;
        bool emergencyWithdrawalInitiated;
        uint256 emergencyWithdrawalTime;
        uint256 lastTradingUpdate;
        address multisig;
    }
    
    struct ClaimRecord {
        uint256 estateId;
        address beneficiary;
        uint256 sharePercentage;
        uint256 claimTime;
        uint256 solAmount;
        uint256 estateTokenAmount;
        bool claimed;
    }
    
    function getEstate(uint256 estateId) external view returns (Estate memory);
    function getClaimRecord(uint256 estateId, address beneficiary) external view returns (ClaimRecord memory);
}

contract TokenVault is Ownable, ReentrancyGuard, ERC721Holder {
    using SafeERC20 for IERC20;

    IDefAIEstate public defaiEstate;

    struct TokenBalance {
        uint256 amount;
        uint256 lastUpdated;
    }

    struct NFTDeposit {
        address collection;
        uint256 tokenId;
        uint256 depositTime;
    }

    // Estate ID => Token Address => Balance
    mapping(uint256 => mapping(address => TokenBalance)) public estateTokenBalances;
    
    // Estate ID => NFT deposits
    mapping(uint256 => NFTDeposit[]) public estateNFTs;
    
    // Estate ID => Token Address => Beneficiary => Claimed
    mapping(uint256 => mapping(address => mapping(address => bool))) public tokenClaims;
    
    // Estate ID => NFT Index => Beneficiary => Claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public nftClaims;

    event TokensDeposited(
        uint256 indexed estateId,
        address indexed token,
        uint256 amount,
        address depositor,
        uint256 timestamp
    );

    event NFTDeposited(
        uint256 indexed estateId,
        address indexed collection,
        uint256 tokenId,
        address depositor,
        uint256 timestamp
    );

    event TokensClaimed(
        uint256 indexed estateId,
        address indexed token,
        address indexed beneficiary,
        uint256 amount,
        uint256 timestamp
    );

    event NFTClaimed(
        uint256 indexed estateId,
        address indexed collection,
        uint256 tokenId,
        address indexed beneficiary,
        uint256 timestamp
    );

    modifier onlyEstateOwner(uint256 estateId) {
        IDefAIEstate.Estate memory estate = defaiEstate.getEstate(estateId);
        require(estate.owner == msg.sender, "Not estate owner");
        _;
    }

    modifier estateClaimable(uint256 estateId) {
        IDefAIEstate.Estate memory estate = defaiEstate.getEstate(estateId);
        require(estate.isClaimable, "Estate not claimable");
        _;
    }

    constructor(address _defaiEstate) {
        defaiEstate = IDefAIEstate(_defaiEstate);
    }

    // ===== Deposit Functions =====
    function depositTokens(
        uint256 estateId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        estateTokenBalances[estateId][token].amount += amount;
        estateTokenBalances[estateId][token].lastUpdated = block.timestamp;

        emit TokensDeposited(estateId, token, amount, msg.sender, block.timestamp);
    }

    function depositNFT(
        uint256 estateId,
        address collection,
        uint256 tokenId
    ) external nonReentrant {
        require(collection != address(0), "Invalid NFT collection");

        IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);

        estateNFTs[estateId].push(NFTDeposit({
            collection: collection,
            tokenId: tokenId,
            depositTime: block.timestamp
        }));

        emit NFTDeposited(estateId, collection, tokenId, msg.sender, block.timestamp);
    }

    // ===== Claim Functions =====
    function claimTokens(
        uint256 estateId,
        address token
    ) external nonReentrant estateClaimable(estateId) {
        // Check if beneficiary has claimed inheritance
        IDefAIEstate.ClaimRecord memory claimRecord = defaiEstate.getClaimRecord(estateId, msg.sender);
        require(claimRecord.claimed, "Must claim inheritance first");
        require(!tokenClaims[estateId][token][msg.sender], "Tokens already claimed");

        uint256 totalBalance = estateTokenBalances[estateId][token].amount;
        require(totalBalance > 0, "No tokens to claim");

        uint256 claimAmount = (totalBalance * claimRecord.sharePercentage) / 100;
        require(claimAmount > 0, "No tokens to claim for this share");

        tokenClaims[estateId][token][msg.sender] = true;
        estateTokenBalances[estateId][token].amount -= claimAmount;

        IERC20(token).safeTransfer(msg.sender, claimAmount);

        emit TokensClaimed(estateId, token, msg.sender, claimAmount, block.timestamp);
    }

    function claimNFT(
        uint256 estateId,
        uint256 nftIndex
    ) external nonReentrant estateClaimable(estateId) {
        // Check if beneficiary has claimed inheritance
        IDefAIEstate.ClaimRecord memory claimRecord = defaiEstate.getClaimRecord(estateId, msg.sender);
        require(claimRecord.claimed, "Must claim inheritance first");
        require(claimRecord.sharePercentage == 100, "NFTs can only be claimed by sole beneficiary");
        require(!nftClaims[estateId][nftIndex][msg.sender], "NFT already claimed");
        require(nftIndex < estateNFTs[estateId].length, "Invalid NFT index");

        NFTDeposit memory nft = estateNFTs[estateId][nftIndex];
        nftClaims[estateId][nftIndex][msg.sender] = true;

        IERC721(nft.collection).safeTransferFrom(address(this), msg.sender, nft.tokenId);

        emit NFTClaimed(estateId, nft.collection, nft.tokenId, msg.sender, block.timestamp);
    }

    // ===== View Functions =====
    function getEstateTokenBalance(
        uint256 estateId,
        address token
    ) external view returns (uint256) {
        return estateTokenBalances[estateId][token].amount;
    }

    function getEstateNFTs(uint256 estateId) external view returns (NFTDeposit[] memory) {
        return estateNFTs[estateId];
    }

    function getClaimableTokenAmount(
        uint256 estateId,
        address token,
        address beneficiary
    ) external view returns (uint256) {
        if (tokenClaims[estateId][token][beneficiary]) {
            return 0;
        }

        IDefAIEstate.ClaimRecord memory claimRecord = defaiEstate.getClaimRecord(estateId, beneficiary);
        if (!claimRecord.claimed) {
            return 0;
        }

        uint256 totalBalance = estateTokenBalances[estateId][token].amount;
        return (totalBalance * claimRecord.sharePercentage) / 100;
    }

    // ===== Emergency Functions =====
    function emergencyWithdrawToken(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
    }

    function emergencyWithdrawNFT(
        address collection,
        uint256 tokenId,
        address to
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        IERC721(collection).safeTransferFrom(address(this), to, tokenId);
    }
}