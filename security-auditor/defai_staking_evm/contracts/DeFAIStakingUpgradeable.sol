// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract DeFAIStakingUpgradeable is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable, 
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable 
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Roles for access control
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");

    // Constants for sustainable economics
    uint256 public constant GOLD_MIN = 10_000_000 * 10**6; // 10M DEFAI (6 decimals)
    uint256 public constant GOLD_MAX = 99_999_999 * 10**6; // 99.99M DEFAI
    uint256 public constant GOLD_APY_BPS = 50; // 0.5% = 50 basis points

    uint256 public constant TITANIUM_MIN = 100_000_000 * 10**6; // 100M DEFAI
    uint256 public constant TITANIUM_MAX = 999_999_999 * 10**6; // 999.99M DEFAI
    uint256 public constant TITANIUM_APY_BPS = 75; // 0.75% = 75 basis points

    uint256 public constant INFINITE_MIN = 1_000_000_000 * 10**6; // 1B DEFAI
    uint256 public constant INFINITE_APY_BPS = 100; // 1% = 100 basis points

    uint256 public constant SECONDS_PER_YEAR = 31_536_000;
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant INITIAL_LOCK_PERIOD = 7 days;
    uint256 public constant ADMIN_TIMELOCK_DURATION = 48 hours;

    // Tiers
    enum Tier {
        None,
        Gold,
        Titanium,
        Infinite
    }

    // State variables (now mutable for upgrades)
    IERC20Upgradeable public defaiToken;
    IERC20Upgradeable public oldDefaiToken; // For migration support
    uint256 public totalStaked;
    uint256 public totalUsers;
    
    // Escrow for rewards
    uint256 public escrowBalance;
    uint256 public totalDistributed;
    
    // Blacklist mapping
    mapping(address => bool) public blacklisted;
    
    // Stake struct
    struct UserStake {
        uint256 stakedAmount;
        uint256 stakeTimestamp;
        uint256 lastStakeTimestamp;
        uint256 lastClaimTimestamp;
        uint256 lockedUntil;
        uint256 accumulatedRewards;
        Tier tier;
    }
    
    // Mappings
    mapping(address => UserStake) public userStakes;

    // Events
    event Staked(address indexed user, uint256 amount, Tier tier);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event EscrowFunded(address indexed funder, uint256 amount, uint256 newBalance);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event UserBlacklisted(address indexed user);
    event UserWhitelisted(address indexed user);
    event TokensUpdated(address indexed newDefaiToken, address indexed oldDefaiToken);

    // Custom errors
    error AmountTooLow();
    error InsufficientStake();
    error TokensLocked();
    error NoRewards();
    error InsufficientEscrowBalance();
    error InvalidAddress();
    error UserIsBlacklisted();
    error NotBlacklisted();

    // Modifiers
    modifier notBlacklisted() {
        if (blacklisted[msg.sender]) revert UserIsBlacklisted();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract
     * @param _defaiToken Address of the DEFAI token
     * @param _oldDefaiToken Address of the old DEFAI token (for migration)
     * @param _admin Address of the admin
     */
    function initialize(
        address _defaiToken,
        address _oldDefaiToken,
        address _admin
    ) public initializer {
        if (_defaiToken == address(0) || _admin == address(0)) revert InvalidAddress();
        
        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        
        defaiToken = IERC20Upgradeable(_defaiToken);
        oldDefaiToken = IERC20Upgradeable(_oldDefaiToken);
        
        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);
        _grantRole(BLACKLIST_ROLE, _admin);
        
        // Transfer ownership to admin
        _transferOwnership(_admin);
    }

    // Admin functions

    /**
     * @dev Update token addresses
     * @param _newDefaiToken New DEFAI token address
     * @param _newOldDefaiToken New old DEFAI token address
     */
    function updateTokens(
        address _newDefaiToken,
        address _newOldDefaiToken
    ) external onlyRole(ADMIN_ROLE) {
        if (_newDefaiToken == address(0)) revert InvalidAddress();
        
        defaiToken = IERC20Upgradeable(_newDefaiToken);
        if (_newOldDefaiToken != address(0)) {
            oldDefaiToken = IERC20Upgradeable(_newOldDefaiToken);
        }
        
        emit TokensUpdated(_newDefaiToken, _newOldDefaiToken);
    }

    /**
     * @dev Blacklist a user
     * @param user Address to blacklist
     */
    function blacklistUser(address user) external onlyRole(BLACKLIST_ROLE) {
        if (user == address(0)) revert InvalidAddress();
        if (blacklisted[user]) revert NotBlacklisted();
        
        blacklisted[user] = true;
        emit UserBlacklisted(user);
    }

    /**
     * @dev Remove user from blacklist
     * @param user Address to whitelist
     */
    function whitelistUser(address user) external onlyRole(BLACKLIST_ROLE) {
        if (!blacklisted[user]) revert NotBlacklisted();
        
        blacklisted[user] = false;
        emit UserWhitelisted(user);
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Initialize escrow (can be called by anyone to fund rewards)
    function fundEscrow(uint256 amount) external nonReentrant notBlacklisted {
        defaiToken.safeTransferFrom(msg.sender, address(this), amount);
        escrowBalance += amount;
        
        emit EscrowFunded(msg.sender, amount, escrowBalance);
    }

    // Stake tokens
    function stakeTokens(uint256 amount) external nonReentrant whenNotPaused notBlacklisted {
        if (amount < GOLD_MIN) revert AmountTooLow();
        
        // Transfer tokens from user to contract
        defaiToken.safeTransferFrom(msg.sender, address(this), amount);
        
        UserStake storage userStake = userStakes[msg.sender];
        
        if (userStake.stakedAmount == 0) {
            // New stake
            userStake.stakeTimestamp = block.timestamp;
            userStake.lastStakeTimestamp = block.timestamp;
            userStake.lastClaimTimestamp = block.timestamp;
            userStake.lockedUntil = block.timestamp + INITIAL_LOCK_PERIOD;
            totalUsers++;
        } else {
            // Additional stake - calculate pending rewards first
            uint256 pendingRewards = _calculatePendingRewards(msg.sender);
            userStake.accumulatedRewards += pendingRewards;
            userStake.lastClaimTimestamp = block.timestamp;
        }
        
        userStake.stakedAmount += amount;
        userStake.lastStakeTimestamp = block.timestamp;
        totalStaked += amount;
        
        // Update tier based on new total
        userStake.tier = _calculateTier(userStake.stakedAmount);
        
        emit Staked(msg.sender, amount, userStake.tier);
    }

    // Calculate tier based on staked amount
    function _calculateTier(uint256 amount) internal pure returns (Tier) {
        if (amount >= INFINITE_MIN) {
            return Tier.Infinite;
        } else if (amount >= TITANIUM_MIN && amount <= TITANIUM_MAX) {
            return Tier.Titanium;
        } else if (amount >= GOLD_MIN && amount <= GOLD_MAX) {
            return Tier.Gold;
        } else {
            return Tier.None;
        }
    }

    // Calculate APY based on tier
    function _getApyBps(Tier tier) internal pure returns (uint256) {
        if (tier == Tier.Infinite) {
            return INFINITE_APY_BPS;
        } else if (tier == Tier.Titanium) {
            return TITANIUM_APY_BPS;
        } else if (tier == Tier.Gold) {
            return GOLD_APY_BPS;
        } else {
            return 0;
        }
    }

    // Calculate pending rewards
    function _calculatePendingRewards(address user) internal view returns (uint256) {
        UserStake storage userStake = userStakes[user];
        
        if (userStake.stakedAmount == 0 || userStake.tier == Tier.None) {
            return 0;
        }
        
        uint256 timeStaked = block.timestamp - userStake.lastClaimTimestamp;
        uint256 apyBps = _getApyBps(userStake.tier);
        
        // Calculate rewards: (stakedAmount * APY * timeStaked) / (SECONDS_PER_YEAR * BASIS_POINTS)
        uint256 rewards = (userStake.stakedAmount * apyBps * timeStaked) / 
                         (SECONDS_PER_YEAR * BASIS_POINTS);
        
        return rewards;
    }

    // Get pending rewards (view function)
    function getPendingRewards(address user) external view returns (uint256) {
        UserStake storage userStake = userStakes[user];
        return userStake.accumulatedRewards + _calculatePendingRewards(user);
    }

    // Claim rewards
    function claimRewards() external nonReentrant whenNotPaused notBlacklisted {
        UserStake storage userStake = userStakes[msg.sender];
        
        uint256 pendingRewards = _calculatePendingRewards(msg.sender);
        uint256 totalRewards = userStake.accumulatedRewards + pendingRewards;
        
        if (totalRewards == 0) revert NoRewards();
        if (escrowBalance < totalRewards) revert InsufficientEscrowBalance();
        
        // Reset rewards
        userStake.accumulatedRewards = 0;
        userStake.lastClaimTimestamp = block.timestamp;
        
        // Update escrow
        escrowBalance -= totalRewards;
        totalDistributed += totalRewards;
        
        // Transfer rewards
        defaiToken.safeTransfer(msg.sender, totalRewards);
        
        emit RewardsClaimed(msg.sender, totalRewards);
    }

    // Unstake tokens
    function unstakeTokens(uint256 amount) external nonReentrant whenNotPaused notBlacklisted {
        UserStake storage userStake = userStakes[msg.sender];
        
        if (userStake.stakedAmount < amount) revert InsufficientStake();
        if (block.timestamp < userStake.lockedUntil) revert TokensLocked();
        
        // Calculate and store pending rewards
        uint256 pendingRewards = _calculatePendingRewards(msg.sender);
        userStake.accumulatedRewards += pendingRewards;
        userStake.lastClaimTimestamp = block.timestamp;
        
        // Update stake
        userStake.stakedAmount -= amount;
        totalStaked -= amount;
        
        // Update tier
        userStake.tier = _calculateTier(userStake.stakedAmount);
        
        // If fully unstaked, decrease user count
        if (userStake.stakedAmount == 0) {
            totalUsers--;
        }
        
        // Transfer tokens back to user
        defaiToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount);
    }

    // Emergency withdraw (forfeits rewards)
    function emergencyWithdraw() external nonReentrant {
        UserStake storage userStake = userStakes[msg.sender];
        uint256 amount = userStake.stakedAmount;
        
        if (amount == 0) revert InsufficientStake();
        
        // Clear user stake
        totalStaked -= amount;
        totalUsers--;
        delete userStakes[msg.sender];
        
        // Transfer tokens back
        defaiToken.safeTransfer(msg.sender, amount);
        
        emit EmergencyWithdraw(msg.sender, amount);
    }

    // Get user stake info
    function getUserStakeInfo(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        Tier tier,
        uint256 lockedUntil,
        uint256 apyBps
    ) {
        UserStake storage userStake = userStakes[user];
        return (
            userStake.stakedAmount,
            userStake.accumulatedRewards + _calculatePendingRewards(user),
            userStake.tier,
            userStake.lockedUntil,
            _getApyBps(userStake.tier)
        );
    }

    // Required for UUPS proxy pattern
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // Gap for future storage variables
    uint256[50] private __gap;
}