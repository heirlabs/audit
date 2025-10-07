// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract DeFAIStaking is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

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

    // State variables
    IERC20 public immutable defaiToken;
    uint256 public totalStaked;
    uint256 public totalUsers;
    
    // Escrow for rewards
    uint256 public escrowBalance;
    uint256 public totalDistributed;
    
    // Authority change timelock (renamed to avoid conflict with Ownable2Step)
    address public pendingNewOwner;
    uint256 public ownerChangeTimestamp;

    // User stake information
    struct UserStake {
        uint256 stakedAmount;
        uint256 rewardsEarned;
        uint256 rewardsClaimed;
        Tier tier;
        uint256 stakeTimestamp;        // Initial stake timestamp
        uint256 lastStakeTimestamp;    // Most recent stake timestamp for penalty calculation
        uint256 lastClaimTimestamp;
        uint256 lockedUntil;
    }

    mapping(address => UserStake) public userStakes;

    // Events
    event Staked(address indexed user, uint256 amount, Tier tier, uint256 totalStaked);
    event Unstaked(address indexed user, uint256 amount, uint256 penalty, uint256 remainingStake, Tier newTier);
    event RewardsClaimed(address indexed user, uint256 amount, uint256 totalDistributed);
    event EscrowFunded(address indexed funder, uint256 amount, uint256 newBalance);
    event OwnershipTransferInitiated(address indexed previousOwner, address indexed newOwner, uint256 timestamp);
    event RewardsCompounded(
        address indexed user,
        uint256 amountCompounded,
        uint256 newStakeAmount,
        Tier oldTier,
        Tier newTier,
        uint256 timestamp
    );

    // Custom errors
    error AmountTooLow();
    error InsufficientStake();
    error TokensLocked();
    error NoRewards();
    error InsufficientEscrowBalance();
    error NoPendingOwnerChange();
    error TimelockNotExpired();
    error InvalidAddress();

    constructor(address _defaiToken) {
        if (_defaiToken == address(0)) revert InvalidAddress();
        defaiToken = IERC20(_defaiToken);
    }

    // Initialize escrow (can be called by owner to fund rewards)
    function fundEscrow(uint256 amount) external nonReentrant {
        defaiToken.safeTransferFrom(msg.sender, address(this), amount);
        escrowBalance += amount;
        
        emit EscrowFunded(msg.sender, amount, escrowBalance);
    }

    // Stake tokens
    function stakeTokens(uint256 amount) external nonReentrant whenNotPaused {
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
            // Calculate pending rewards before adding new stake
            uint256 pendingRewards = _calculateRewards(
                userStake.stakedAmount,
                _getTierApy(userStake.stakedAmount),
                userStake.lastClaimTimestamp,
                block.timestamp
            );
            
            userStake.rewardsEarned += pendingRewards;
            userStake.lastClaimTimestamp = block.timestamp;
            userStake.lastStakeTimestamp = block.timestamp;
            userStake.lockedUntil = block.timestamp + INITIAL_LOCK_PERIOD;
        }
        
        userStake.stakedAmount += amount;
        userStake.tier = _getTier(userStake.stakedAmount);
        
        totalStaked += amount;
        
        emit Staked(msg.sender, amount, userStake.tier, userStake.stakedAmount);
    }

    // Unstake tokens
    function unstakeTokens(uint256 amount) external nonReentrant whenNotPaused {
        UserStake storage userStake = userStakes[msg.sender];
        
        if (block.timestamp < userStake.lockedUntil) revert TokensLocked();
        if (userStake.stakedAmount < amount) revert InsufficientStake();
        
        // Calculate pending rewards before unstaking
        uint256 pendingRewards = _calculateRewards(
            userStake.stakedAmount,
            _getTierApy(userStake.stakedAmount),
            userStake.lastClaimTimestamp,
            block.timestamp
        );
        userStake.rewardsEarned += pendingRewards;
        userStake.lastClaimTimestamp = block.timestamp;
        
        // Calculate unstaking penalty
        uint256 penalty = _calculateUnstakePenalty(
            userStake.lastStakeTimestamp,
            block.timestamp,
            amount
        );
        
        uint256 amountAfterPenalty = amount - penalty;
        
        // Transfer tokens back to user (minus penalty)
        defaiToken.safeTransfer(msg.sender, amountAfterPenalty);
        
        // Add penalty to escrow if any
        if (penalty > 0) {
            escrowBalance += penalty;
        }
        
        // Update user stake
        userStake.stakedAmount -= amount;
        userStake.tier = userStake.stakedAmount > 0 ? _getTier(userStake.stakedAmount) : Tier.None;
        
        totalStaked -= amount;
        
        emit Unstaked(msg.sender, amount, penalty, userStake.stakedAmount, userStake.tier);
    }

    // Claim rewards
    function claimRewards() external nonReentrant whenNotPaused {
        UserStake storage userStake = userStakes[msg.sender];
        
        // Calculate pending rewards
        uint256 pendingRewards = _calculateRewards(
            userStake.stakedAmount,
            _getTierApy(userStake.stakedAmount),
            userStake.lastClaimTimestamp,
            block.timestamp
        );
        
        uint256 totalClaimable = userStake.rewardsEarned + pendingRewards - userStake.rewardsClaimed;
        
        if (totalClaimable == 0) revert NoRewards();
        if (escrowBalance < totalClaimable) revert InsufficientEscrowBalance();
        
        // Transfer rewards from escrow to user
        defaiToken.safeTransfer(msg.sender, totalClaimable);
        
        // Update state
        userStake.rewardsEarned += pendingRewards;
        userStake.rewardsClaimed += totalClaimable;
        userStake.lastClaimTimestamp = block.timestamp;
        
        escrowBalance -= totalClaimable;
        totalDistributed += totalClaimable;
        
        emit RewardsClaimed(msg.sender, totalClaimable, totalDistributed);
    }

    // Compound rewards (restake rewards)
    function compoundRewards() external nonReentrant whenNotPaused {
        UserStake storage userStake = userStakes[msg.sender];
        
        // Calculate pending rewards
        uint256 pendingRewards = _calculateRewards(
            userStake.stakedAmount,
            _getTierApy(userStake.stakedAmount),
            userStake.lastClaimTimestamp,
            block.timestamp
        );
        
        uint256 totalUnclaimed = userStake.rewardsEarned + pendingRewards - userStake.rewardsClaimed;
        
        if (totalUnclaimed == 0) revert NoRewards();
        if (escrowBalance < totalUnclaimed) revert InsufficientEscrowBalance();
        
        // Update stake amount by adding rewards
        Tier oldTier = userStake.tier;
        
        userStake.stakedAmount += totalUnclaimed;
        userStake.tier = _getTier(userStake.stakedAmount);
        
        // Update reward tracking
        userStake.rewardsEarned += pendingRewards;
        userStake.rewardsClaimed = userStake.rewardsEarned; // Mark all as claimed since compounded
        userStake.lastClaimTimestamp = block.timestamp;
        
        // Reduce escrow balance (rewards stay in contract as part of stake)
        escrowBalance -= totalUnclaimed;
        totalDistributed += totalUnclaimed;
        totalStaked += totalUnclaimed;
        
        emit RewardsCompounded(
            msg.sender,
            totalUnclaimed,
            userStake.stakedAmount,
            oldTier,
            userStake.tier,
            block.timestamp
        );
    }

    // View functions
    function getUserStakeInfo(address user) external view returns (
        uint256 stakedAmount,
        uint256 rewardsEarned,
        uint256 rewardsClaimed,
        Tier tier,
        uint256 lockedUntil,
        uint256 pendingRewards
    ) {
        UserStake memory userStake = userStakes[user];
        pendingRewards = _calculateRewards(
            userStake.stakedAmount,
            _getTierApy(userStake.stakedAmount),
            userStake.lastClaimTimestamp,
            block.timestamp
        );
        
        return (
            userStake.stakedAmount,
            userStake.rewardsEarned,
            userStake.rewardsClaimed,
            userStake.tier,
            userStake.lockedUntil,
            pendingRewards
        );
    }

    function getTotalClaimableRewards(address user) external view returns (uint256) {
        UserStake memory userStake = userStakes[user];
        uint256 pendingRewards = _calculateRewards(
            userStake.stakedAmount,
            _getTierApy(userStake.stakedAmount),
            userStake.lastClaimTimestamp,
            block.timestamp
        );
        
        return userStake.rewardsEarned + pendingRewards - userStake.rewardsClaimed;
    }

    // Admin functions
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Timelock for ownership transfer
    function initiateOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingNewOwner = newOwner;
        ownerChangeTimestamp = block.timestamp + ADMIN_TIMELOCK_DURATION;
        
        emit OwnershipTransferInitiated(owner(), newOwner, block.timestamp);
    }

    function acceptOwnershipTransfer() external {
        if (pendingNewOwner == address(0)) revert NoPendingOwnerChange();
        if (block.timestamp < ownerChangeTimestamp) revert TimelockNotExpired();
        if (msg.sender != pendingNewOwner) revert InvalidAddress();
        
        _transferOwnership(pendingNewOwner);
        pendingNewOwner = address(0);
        ownerChangeTimestamp = 0;
    }

    // Internal functions
    function _getTier(uint256 amount) private pure returns (Tier) {
        if (amount >= INFINITE_MIN) {
            return Tier.Infinite;
        } else if (amount >= TITANIUM_MIN) {
            return Tier.Titanium;
        } else if (amount >= GOLD_MIN) {
            return Tier.Gold;
        } else {
            return Tier.None;
        }
    }

    function _getTierApy(uint256 amount) private pure returns (uint256) {
        if (amount >= INFINITE_MIN) {
            return INFINITE_APY_BPS;
        } else if (amount >= TITANIUM_MIN) {
            return TITANIUM_APY_BPS;
        } else if (amount >= GOLD_MIN) {
            return GOLD_APY_BPS;
        } else {
            return 0;
        }
    }

    function _calculateRewards(
        uint256 stakedAmount,
        uint256 tierApyBps,
        uint256 lastClaimTimestamp,
        uint256 currentTimestamp
    ) private pure returns (uint256) {
        if (tierApyBps == 0 || stakedAmount == 0) return 0;
        
        uint256 timeElapsed = currentTimestamp - lastClaimTimestamp;
        
        // Calculate rewards: amount * apy * time / (year * basis_points)
        return (stakedAmount * tierApyBps * timeElapsed) / (SECONDS_PER_YEAR * BASIS_POINTS);
    }

    function _calculateUnstakePenalty(
        uint256 stakeTimestamp,
        uint256 currentTimestamp,
        uint256 amount
    ) private pure returns (uint256) {
        uint256 daysStaked = (currentTimestamp - stakeTimestamp) / 1 days;
        
        uint256 penaltyBps;
        if (daysStaked < 30) {
            penaltyBps = 200; // 2%
        } else if (daysStaked < 90) {
            penaltyBps = 100; // 1%
        } else {
            penaltyBps = 0; // No penalty
        }
        
        return (amount * penaltyBps) / BASIS_POINTS;
    }

    // Emergency withdrawal (only owner, after timelock)
    uint256 public emergencyWithdrawalTimestamp;
    
    function initiateEmergencyWithdrawal() external onlyOwner {
        emergencyWithdrawalTimestamp = block.timestamp + ADMIN_TIMELOCK_DURATION;
    }
    
    function executeEmergencyWithdrawal(address token, uint256 amount) external onlyOwner {
        if (block.timestamp < emergencyWithdrawalTimestamp) revert TimelockNotExpired();
        if (token == address(0)) revert InvalidAddress();
        
        IERC20(token).safeTransfer(owner(), amount);
        emergencyWithdrawalTimestamp = 0;
    }
}