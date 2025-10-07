// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDefaiAppFactory
 * @dev Interface for the DefaiAppFactory contract
 */
interface IDefaiAppFactory {
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
        uint8 rating;
        string commentCid;
        uint256 timestamp;
        bool exists;
    }

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
    // Core Functions
    // ============================================================================

    function registerApp(
        uint256 price,
        uint256 maxSupply,
        string calldata metadataUri
    ) external returns (uint256);

    function purchaseAppAccess(uint256 appId) external;

    function batchPurchaseApps(uint256[] calldata appIds) external;

    function toggleAppStatus(uint256 appId) external;

    function updateAppMetadata(
        uint256 appId,
        string calldata newMetadataUri,
        uint256 newPrice
    ) external;

    function submitReview(
        uint256 appId,
        uint8 rating,
        string calldata commentCid
    ) external;

    function updateReview(
        uint256 appId,
        uint8 newRating,
        string calldata newCommentCid
    ) external;

    function refundPurchase(
        uint256 appId,
        address user,
        string calldata reason
    ) external;

    function updatePlatformSettings(
        uint16 newPlatformFeeBps,
        address newTreasury
    ) external;

    // ============================================================================
    // View Functions
    // ============================================================================

    function totalApps() external view returns (uint256);

    function getApp(uint256 appId) external view returns (AppRegistration memory);

    function getAppAverageRating(uint256 appId) external view returns (uint256);

    function getUserPurchasedApps(address user) external view returns (uint256[] memory);

    function getCreatorApps(address creator) external view returns (uint256[] memory);

    function hasAccess(address user, uint256 appId) external view returns (bool);
}