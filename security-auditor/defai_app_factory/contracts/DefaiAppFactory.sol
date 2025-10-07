// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title DefaiAppFactory
 * @dev EVM implementation of the Solana defai_app_factory program
 * @notice Manages app registrations, SFT minting, and purchase transactions
 */
contract DefaiAppFactory is Ownable2Step, ReentrancyGuard, Pausable, ERC1155 {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;

    // ============================================================================
    // State Variables
    // ============================================================================

    IERC20 public immutable defaiToken;
    address public treasury;
    uint16 public platformFeeBps; // Basis points (10000 = 100%)
    uint256 public constant MAX_METADATA_URI_LEN = 100;
    uint256 public constant MAX_REVIEW_CID_LEN = 46;
    
    Counters.Counter private _appIdCounter;

    // ============================================================================
    // Data Structures
    // ============================================================================

    struct AppRegistration {
        uint256 appId;
        address creator;
        uint256 price;
        uint256 maxSupply;
        uint256 currentSupply;
        bool isActive;
        string metadataUri;
        uint256 createdAt;
    }

    struct UserAppAccess {
        address user;
        uint256 appId;
        uint256 purchasedAt;
        uint256 purchasePrice;
        bool hasAccess;
    }

    struct AppReview {
        uint256 appId;
        address reviewer;
        uint8 rating; // 1-5
        string commentCid; // IPFS CID
        uint256 timestamp;
        bool exists;
    }

    struct RefundRecord {
        uint256 appId;
        address user;
        uint256 refundAmount;
        string reason;
        uint256 timestamp;
    }

    // ============================================================================
    // Storage Mappings
    // ============================================================================

    mapping(uint256 => AppRegistration) public appRegistrations;
    mapping(address => mapping(uint256 => UserAppAccess)) public userAppAccess;
    mapping(address => mapping(uint256 => AppReview)) public appReviews;
    mapping(address => mapping(uint256 => RefundRecord)) public refunds;
    mapping(uint256 => uint256) public appTotalRatings;
    mapping(uint256 => uint256) public appReviewCount;
    
    // Creator to app IDs mapping
    mapping(address => uint256[]) public creatorApps;
    // User to purchased app IDs mapping  
    mapping(address => uint256[]) public userPurchasedApps;

    // ============================================================================
    // Events
    // ============================================================================

    event AppRegistered(
        uint256 indexed appId,
        address indexed creator,
        uint256 price,
        uint256 maxSupply,
        uint256 timestamp
    );

    event AppPurchased(
        uint256 indexed appId,
        address indexed user,
        uint256 price,
        uint256 platformFee,
        uint256 creatorAmount,
        uint256 timestamp
    );

    event AppStatusChanged(
        uint256 indexed appId,
        bool isActive,
        uint256 timestamp
    );

    event PlatformSettingsUpdated(
        uint16 platformFeeBps,
        address treasury,
        uint256 timestamp
    );

    event AppMetadataUpdated(
        uint256 indexed appId,
        string newMetadataUri,
        uint256 newPrice,
        uint256 timestamp
    );

    event ReviewSubmitted(
        uint256 indexed appId,
        address indexed reviewer,
        uint8 rating,
        string commentCid,
        uint256 timestamp
    );

    event ReviewUpdated(
        uint256 indexed appId,
        address indexed reviewer,
        uint8 newRating,
        string newCommentCid,
        uint256 timestamp
    );

    event PurchaseRefunded(
        uint256 indexed appId,
        address indexed user,
        uint256 refundAmount,
        string reason,
        uint256 timestamp
    );

    // ============================================================================
    // Errors
    // ============================================================================

    error InvalidPlatformFee();
    error InvalidPrice();
    error InvalidMaxSupply();
    error MetadataUriTooLong();
    error AppNotActive();
    error MaxSupplyReached();
    error UnauthorizedCreator();
    error InvalidTreasury();
    error InsufficientBalance();
    error MustOwnAppToReview();
    error InvalidRating();
    error CommentCidTooLong();
    error ReviewAlreadyExists();
    error ReviewDoesNotExist();
    error NoAccessToRefund();
    error RefundAlreadyProcessed();
    error InsufficientCreatorBalance();
    error AppDoesNotExist();
    error AlreadyOwnsApp();

    // ============================================================================
    // Constructor
    // ============================================================================

    /**
     * @dev Initialize the DefaiAppFactory contract
     * @param _defaiToken Address of the DEFAI ERC20 token
     * @param _treasury Initial treasury address
     * @param _platformFeeBps Initial platform fee in basis points
     */
    constructor(
        address _defaiToken,
        address _treasury,
        uint16 _platformFeeBps
    ) ERC1155("") {
        if (_platformFeeBps > 10000) revert InvalidPlatformFee();
        if (_treasury == address(0)) revert InvalidTreasury();
        
        defaiToken = IERC20(_defaiToken);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ============================================================================
    // App Registration Functions
    // ============================================================================

    /**
     * @dev Register a new app in the marketplace
     * @param price Price in DEFAI tokens (with decimals)
     * @param maxSupply Maximum number of SFTs that can be minted
     * @param metadataUri IPFS URI for app metadata
     * @return appId The ID of the newly registered app
     */
    function registerApp(
        uint256 price,
        uint256 maxSupply,
        string calldata metadataUri
    ) external whenNotPaused returns (uint256) {
        if (price == 0) revert InvalidPrice();
        if (maxSupply == 0) revert InvalidMaxSupply();
        if (bytes(metadataUri).length > MAX_METADATA_URI_LEN) revert MetadataUriTooLong();

        uint256 appId = _appIdCounter.current();
        _appIdCounter.increment();

        appRegistrations[appId] = AppRegistration({
            appId: appId,
            creator: msg.sender,
            price: price,
            maxSupply: maxSupply,
            currentSupply: 0,
            isActive: true,
            metadataUri: metadataUri,
            createdAt: block.timestamp
        });

        creatorApps[msg.sender].push(appId);

        emit AppRegistered(appId, msg.sender, price, maxSupply, block.timestamp);
        
        return appId;
    }

    // ============================================================================
    // Purchase Functions
    // ============================================================================

    /**
     * @dev Purchase access to an app
     * @param appId ID of the app to purchase
     */
    function purchaseAppAccess(uint256 appId) external nonReentrant whenNotPaused {
        _purchaseApp(appId);
    }

    /**
     * @dev Purchase multiple apps in a single transaction
     * @param appIds Array of app IDs to purchase
     */
    function batchPurchaseApps(uint256[] calldata appIds) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < appIds.length; i++) {
            _purchaseApp(appIds[i]);
        }
    }

    /**
     * @dev Internal function to purchase an app
     */
    function _purchaseApp(uint256 appId) internal {
        AppRegistration storage app = appRegistrations[appId];
        
        if (app.creator == address(0)) revert AppDoesNotExist();
        if (!app.isActive) revert AppNotActive();
        if (app.currentSupply >= app.maxSupply) revert MaxSupplyReached();
        if (userAppAccess[msg.sender][appId].hasAccess) revert AlreadyOwnsApp();

        uint256 price = app.price;
        uint256 platformFee = (price * platformFeeBps) / 10000;
        uint256 creatorAmount = price - platformFee;

        // Check user balance
        if (defaiToken.balanceOf(msg.sender) < price) revert InsufficientBalance();

        // Transfer platform fee to treasury
        defaiToken.safeTransferFrom(msg.sender, treasury, platformFee);
        
        // Transfer creator amount to creator
        defaiToken.safeTransferFrom(msg.sender, app.creator, creatorAmount);

        // Mint SFT (ERC1155 token) to user
        _mint(msg.sender, appId, 1, "");
        
        // Update supply
        app.currentSupply++;

        // Record access
        userAppAccess[msg.sender][appId] = UserAppAccess({
            user: msg.sender,
            appId: appId,
            purchasedAt: block.timestamp,
            purchasePrice: price,
            hasAccess: true
        });

        userPurchasedApps[msg.sender].push(appId);

        emit AppPurchased(appId, msg.sender, price, platformFee, creatorAmount, block.timestamp);
    }

    // ============================================================================
    // App Management Functions
    // ============================================================================

    /**
     * @dev Toggle the active status of an app
     * @param appId ID of the app
     */
    function toggleAppStatus(uint256 appId) external {
        AppRegistration storage app = appRegistrations[appId];
        if (app.creator != msg.sender) revert UnauthorizedCreator();
        
        app.isActive = !app.isActive;
        
        emit AppStatusChanged(appId, app.isActive, block.timestamp);
    }

    /**
     * @dev Update app metadata and/or price
     * @param appId ID of the app
     * @param newMetadataUri New IPFS URI for metadata (optional)
     * @param newPrice New price (optional, 0 to keep current)
     */
    function updateAppMetadata(
        uint256 appId,
        string calldata newMetadataUri,
        uint256 newPrice
    ) external {
        AppRegistration storage app = appRegistrations[appId];
        if (app.creator != msg.sender) revert UnauthorizedCreator();
        
        if (bytes(newMetadataUri).length > 0) {
            if (bytes(newMetadataUri).length > MAX_METADATA_URI_LEN) revert MetadataUriTooLong();
            app.metadataUri = newMetadataUri;
        }
        
        if (newPrice > 0) {
            app.price = newPrice;
        }
        
        emit AppMetadataUpdated(appId, newMetadataUri, newPrice, block.timestamp);
    }

    // ============================================================================
    // Review Functions
    // ============================================================================

    /**
     * @dev Submit a review for an app
     * @param appId ID of the app to review
     * @param rating Rating from 1 to 5
     * @param commentCid IPFS CID for the comment
     */
    function submitReview(
        uint256 appId,
        uint8 rating,
        string calldata commentCid
    ) external {
        if (!userAppAccess[msg.sender][appId].hasAccess) revert MustOwnAppToReview();
        if (rating < 1 || rating > 5) revert InvalidRating();
        if (bytes(commentCid).length > MAX_REVIEW_CID_LEN) revert CommentCidTooLong();
        if (appReviews[msg.sender][appId].exists) revert ReviewAlreadyExists();

        appReviews[msg.sender][appId] = AppReview({
            appId: appId,
            reviewer: msg.sender,
            rating: rating,
            commentCid: commentCid,
            timestamp: block.timestamp,
            exists: true
        });

        appTotalRatings[appId] += rating;
        appReviewCount[appId]++;

        emit ReviewSubmitted(appId, msg.sender, rating, commentCid, block.timestamp);
    }

    /**
     * @dev Update an existing review
     * @param appId ID of the app
     * @param newRating New rating from 1 to 5
     * @param newCommentCid New IPFS CID for the comment
     */
    function updateReview(
        uint256 appId,
        uint8 newRating,
        string calldata newCommentCid
    ) external {
        AppReview storage review = appReviews[msg.sender][appId];
        if (!review.exists) revert ReviewDoesNotExist();
        if (newRating < 1 || newRating > 5) revert InvalidRating();
        if (bytes(newCommentCid).length > MAX_REVIEW_CID_LEN) revert CommentCidTooLong();

        // Update average rating calculation
        appTotalRatings[appId] = appTotalRatings[appId] - review.rating + newRating;
        
        review.rating = newRating;
        review.commentCid = newCommentCid;
        review.timestamp = block.timestamp;

        emit ReviewUpdated(appId, msg.sender, newRating, newCommentCid, block.timestamp);
    }

    // ============================================================================
    // Refund Functions
    // ============================================================================

    /**
     * @dev Process a refund for a purchase (creator initiated)
     * @param appId ID of the app
     * @param user Address of the user to refund
     * @param reason Reason for the refund
     */
    function refundPurchase(
        uint256 appId,
        address user,
        string calldata reason
    ) external nonReentrant {
        AppRegistration storage app = appRegistrations[appId];
        if (app.creator != msg.sender) revert UnauthorizedCreator();
        
        UserAppAccess storage access = userAppAccess[user][appId];
        if (!access.hasAccess) revert NoAccessToRefund();
        
        if (refunds[user][appId].timestamp > 0) revert RefundAlreadyProcessed();

        uint256 refundAmount = access.purchasePrice;
        
        // Check creator has sufficient balance
        if (defaiToken.balanceOf(msg.sender) < refundAmount) {
            revert InsufficientCreatorBalance();
        }

        // Burn the user's SFT
        _burn(user, appId, 1);
        
        // Transfer refund from creator to user
        defaiToken.safeTransferFrom(msg.sender, user, refundAmount);
        
        // Update access record
        access.hasAccess = false;
        
        // Record refund
        refunds[user][appId] = RefundRecord({
            appId: appId,
            user: user,
            refundAmount: refundAmount,
            reason: reason,
            timestamp: block.timestamp
        });
        
        // Update supply
        app.currentSupply--;

        emit PurchaseRefunded(appId, user, refundAmount, reason, block.timestamp);
    }

    // ============================================================================
    // Platform Admin Functions
    // ============================================================================

    /**
     * @dev Update platform settings
     * @param newPlatformFeeBps New platform fee in basis points
     * @param newTreasury New treasury address
     */
    function updatePlatformSettings(
        uint16 newPlatformFeeBps,
        address newTreasury
    ) external onlyOwner {
        if (newPlatformFeeBps > 10000) revert InvalidPlatformFee();
        if (newTreasury == address(0)) revert InvalidTreasury();
        
        platformFeeBps = newPlatformFeeBps;
        treasury = newTreasury;
        
        emit PlatformSettingsUpdated(newPlatformFeeBps, newTreasury, block.timestamp);
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @dev Get the total number of registered apps
     */
    function totalApps() external view returns (uint256) {
        return _appIdCounter.current();
    }

    /**
     * @dev Get app details
     */
    function getApp(uint256 appId) external view returns (AppRegistration memory) {
        return appRegistrations[appId];
    }

    /**
     * @dev Get average rating for an app
     */
    function getAppAverageRating(uint256 appId) external view returns (uint256) {
        uint256 count = appReviewCount[appId];
        if (count == 0) return 0;
        return (appTotalRatings[appId] * 100) / count; // Returns rating * 100 for precision
    }

    /**
     * @dev Get user's purchased apps
     */
    function getUserPurchasedApps(address user) external view returns (uint256[] memory) {
        return userPurchasedApps[user];
    }

    /**
     * @dev Get creator's apps
     */
    function getCreatorApps(address creator) external view returns (uint256[] memory) {
        return creatorApps[creator];
    }

    /**
     * @dev Check if user has access to an app
     */
    function hasAccess(address user, uint256 appId) external view returns (bool) {
        return userAppAccess[user][appId].hasAccess;
    }

    // ============================================================================
    // ERC1155 Overrides
    // ============================================================================

    /**
     * @dev Override URI to return app-specific metadata
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        return appRegistrations[tokenId].metadataUri;
    }

    /**
     * @dev Prevent transfers of app SFTs (soulbound)
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
        
        // Allow minting and burning, but prevent transfers
        if (from != address(0) && to != address(0)) {
            revert("SFTs are non-transferable");
        }
    }
}