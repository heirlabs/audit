// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

contract DefaiAppFactoryUpgradeable is 
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ERC1155Upgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    // State Variables
    IERC20Upgradeable public defaiToken;
    address public treasury;
    uint16 public platformFeeBps;
    uint256 public constant MAX_METADATA_URI_LEN = 100;
    uint256 public constant MAX_REVIEW_CID_LEN = 46;
    
    CountersUpgradeable.Counter private _appIdCounter;

    // Blacklist
    mapping(address => bool) public blacklisted;

    // Data Structures
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
        uint8 rating;
        string commentCid;
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

    // Storage Mappings
    mapping(uint256 => AppRegistration) public appRegistrations;
    mapping(address => mapping(uint256 => UserAppAccess)) public userAppAccess;
    mapping(address => mapping(uint256 => AppReview)) public appReviews;
    mapping(address => mapping(uint256 => RefundRecord)) public refunds;
    mapping(uint256 => uint256) public appTotalRatings;
    mapping(uint256 => uint256) public appReviewCount;
    mapping(address => uint256[]) public creatorApps;
    mapping(address => uint256[]) public userPurchasedApps;

    // Events
    event AppRegistered(
        uint256 indexed appId,
        address indexed creator,
        uint256 price,
        uint256 maxSupply,
        uint256 timestamp
    );

    event AppPurchased(
        uint256 indexed appId,
        address indexed buyer,
        address indexed creator,
        uint256 price,
        uint256 platformFee,
        uint256 creatorRevenue,
        uint256 timestamp
    );

    event AppReviewed(
        uint256 indexed appId,
        address indexed reviewer,
        uint8 rating,
        uint256 timestamp
    );

    event AppRefunded(
        uint256 indexed appId,
        address indexed user,
        uint256 refundAmount,
        string reason,
        uint256 timestamp
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PlatformFeeUpdated(uint16 oldFee, uint16 newFee);
    event AppDeactivated(uint256 indexed appId);
    event TokensUpdated(address indexed newDefaiToken);
    event UserBlacklisted(address indexed user);
    event UserWhitelisted(address indexed user);

    // Errors
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
    error UserIsBlacklisted();
    error InvalidAddress();

    // Modifiers
    modifier notBlacklisted() {
        if (blacklisted[msg.sender]) revert UserIsBlacklisted();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _defaiToken,
        address _treasury,
        uint16 _platformFeeBps
    ) public initializer {
        if (_platformFeeBps > 10000) revert InvalidPlatformFee();
        if (_treasury == address(0) || _defaiToken == address(0)) revert InvalidTreasury();
        
        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __ERC1155_init("");
        __UUPSUpgradeable_init();
        
        defaiToken = IERC20Upgradeable(_defaiToken);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;

        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _treasury);
        _grantRole(ADMIN_ROLE, _treasury);
        _grantRole(PAUSER_ROLE, _treasury);
        _grantRole(UPGRADER_ROLE, _treasury);
        _grantRole(BLACKLIST_ROLE, _treasury);
        _grantRole(TREASURY_ROLE, _treasury);
        
        _transferOwnership(_treasury);
    }

    // Admin Functions

    function updateTokenAddress(address _newDefaiToken) external onlyRole(ADMIN_ROLE) {
        if (_newDefaiToken == address(0)) revert InvalidAddress();
        defaiToken = IERC20Upgradeable(_newDefaiToken);
        emit TokensUpdated(_newDefaiToken);
    }

    function updateTreasury(address newTreasury) external onlyRole(TREASURY_ROLE) {
        if (newTreasury == address(0)) revert InvalidTreasury();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function updatePlatformFee(uint16 newFeeBps) external onlyRole(ADMIN_ROLE) {
        if (newFeeBps > 10000) revert InvalidPlatformFee();
        uint16 oldFee = platformFeeBps;
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(oldFee, newFeeBps);
    }

    function blacklistUser(address user) external onlyRole(BLACKLIST_ROLE) {
        if (user == address(0)) revert InvalidAddress();
        blacklisted[user] = true;
        emit UserBlacklisted(user);
    }

    function whitelistUser(address user) external onlyRole(BLACKLIST_ROLE) {
        blacklisted[user] = false;
        emit UserWhitelisted(user);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function deactivateApp(uint256 appId) external onlyRole(ADMIN_ROLE) {
        AppRegistration storage app = appRegistrations[appId];
        if (app.appId == 0) revert AppDoesNotExist();
        app.isActive = false;
        emit AppDeactivated(appId);
    }

    // Core Functions

    function registerApp(
        uint256 price,
        uint256 maxSupply,
        string memory metadataUri
    ) external nonReentrant whenNotPaused notBlacklisted returns (uint256) {
        if (price == 0) revert InvalidPrice();
        if (maxSupply == 0) revert InvalidMaxSupply();
        if (bytes(metadataUri).length > MAX_METADATA_URI_LEN) revert MetadataUriTooLong();

        _appIdCounter.increment();
        uint256 newAppId = _appIdCounter.current();

        AppRegistration storage newApp = appRegistrations[newAppId];
        newApp.appId = newAppId;
        newApp.creator = msg.sender;
        newApp.price = price;
        newApp.maxSupply = maxSupply;
        newApp.currentSupply = 0;
        newApp.isActive = true;
        newApp.metadataUri = metadataUri;
        newApp.createdAt = block.timestamp;

        creatorApps[msg.sender].push(newAppId);

        emit AppRegistered(
            newAppId,
            msg.sender,
            price,
            maxSupply,
            block.timestamp
        );

        return newAppId;
    }

    function purchaseApp(uint256 appId) external nonReentrant whenNotPaused notBlacklisted {
        AppRegistration storage app = appRegistrations[appId];
        
        if (app.appId == 0) revert AppDoesNotExist();
        if (!app.isActive) revert AppNotActive();
        if (app.currentSupply >= app.maxSupply) revert MaxSupplyReached();
        if (userAppAccess[msg.sender][appId].hasAccess) revert AlreadyOwnsApp();

        uint256 platformFee = (app.price * platformFeeBps) / 10000;
        uint256 creatorRevenue = app.price - platformFee;

        defaiToken.safeTransferFrom(msg.sender, treasury, platformFee);
        defaiToken.safeTransferFrom(msg.sender, app.creator, creatorRevenue);

        app.currentSupply++;
        _mint(msg.sender, appId, 1, "");

        UserAppAccess storage access = userAppAccess[msg.sender][appId];
        access.user = msg.sender;
        access.appId = appId;
        access.purchasedAt = block.timestamp;
        access.purchasePrice = app.price;
        access.hasAccess = true;

        userPurchasedApps[msg.sender].push(appId);

        emit AppPurchased(
            appId,
            msg.sender,
            app.creator,
            app.price,
            platformFee,
            creatorRevenue,
            block.timestamp
        );
    }

    function addReview(
        uint256 appId,
        uint8 rating,
        string memory commentCid
    ) external nonReentrant whenNotPaused notBlacklisted {
        if (!userAppAccess[msg.sender][appId].hasAccess) revert MustOwnAppToReview();
        if (rating < 1 || rating > 5) revert InvalidRating();
        if (bytes(commentCid).length > MAX_REVIEW_CID_LEN) revert CommentCidTooLong();
        if (appReviews[msg.sender][appId].exists) revert ReviewAlreadyExists();

        AppReview storage review = appReviews[msg.sender][appId];
        review.appId = appId;
        review.reviewer = msg.sender;
        review.rating = rating;
        review.commentCid = commentCid;
        review.timestamp = block.timestamp;
        review.exists = true;

        appTotalRatings[appId] += rating;
        appReviewCount[appId]++;

        emit AppReviewed(appId, msg.sender, rating, block.timestamp);
    }

    function updateReview(
        uint256 appId,
        uint8 newRating,
        string memory newCommentCid
    ) external nonReentrant whenNotPaused notBlacklisted {
        AppReview storage review = appReviews[msg.sender][appId];
        
        if (!review.exists) revert ReviewDoesNotExist();
        if (newRating < 1 || newRating > 5) revert InvalidRating();
        if (bytes(newCommentCid).length > MAX_REVIEW_CID_LEN) revert CommentCidTooLong();

        appTotalRatings[appId] = appTotalRatings[appId] - review.rating + newRating;

        review.rating = newRating;
        review.commentCid = newCommentCid;
        review.timestamp = block.timestamp;

        emit AppReviewed(appId, msg.sender, newRating, block.timestamp);
    }

    function processRefund(
        uint256 appId,
        address user,
        string memory reason
    ) external nonReentrant whenNotPaused {
        AppRegistration storage app = appRegistrations[appId];
        UserAppAccess storage access = userAppAccess[user][appId];
        
        if (msg.sender != app.creator) revert UnauthorizedCreator();
        if (!access.hasAccess) revert NoAccessToRefund();
        if (refunds[user][appId].timestamp != 0) revert RefundAlreadyProcessed();

        uint256 refundAmount = access.purchasePrice;
        uint256 platformFee = (refundAmount * platformFeeBps) / 10000;
        uint256 creatorRefund = refundAmount - platformFee;

        defaiToken.safeTransferFrom(app.creator, user, creatorRefund);
        defaiToken.safeTransferFrom(treasury, user, platformFee);

        access.hasAccess = false;
        _burn(user, appId, 1);

        RefundRecord storage refund = refunds[user][appId];
        refund.appId = appId;
        refund.user = user;
        refund.refundAmount = refundAmount;
        refund.reason = reason;
        refund.timestamp = block.timestamp;

        emit AppRefunded(appId, user, refundAmount, reason, block.timestamp);
    }

    // View Functions

    function getAppInfo(uint256 appId) external view returns (AppRegistration memory) {
        return appRegistrations[appId];
    }

    function getUserAccess(address user, uint256 appId) external view returns (bool) {
        return userAppAccess[user][appId].hasAccess;
    }

    function getAppAverageRating(uint256 appId) external view returns (uint256) {
        if (appReviewCount[appId] == 0) return 0;
        return (appTotalRatings[appId] * 100) / appReviewCount[appId];
    }

    function getCreatorApps(address creator) external view returns (uint256[] memory) {
        return creatorApps[creator];
    }

    function getUserPurchasedApps(address user) external view returns (uint256[] memory) {
        return userPurchasedApps[user];
    }

    function getTotalApps() external view returns (uint256) {
        return _appIdCounter.current();
    }

    // Required for UUPS
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // Gap for future storage variables
    uint256[50] private __gap;
}