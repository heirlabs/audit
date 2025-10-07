// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IDeFAIStaking {
    enum Tier {
        None,
        Gold,
        Titanium,
        Infinite
    }

    struct UserStake {
        uint256 stakedAmount;
        uint256 rewardsEarned;
        uint256 rewardsClaimed;
        Tier tier;
        uint256 stakeTimestamp;
        uint256 lastStakeTimestamp;
        uint256 lastClaimTimestamp;
        uint256 lockedUntil;
    }

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

    // Functions
    function stakeTokens(uint256 amount) external;
    function unstakeTokens(uint256 amount) external;
    function claimRewards() external;
    function compoundRewards() external;
    function fundEscrow(uint256 amount) external;
    
    // View functions
    function getUserStakeInfo(address user) external view returns (
        uint256 stakedAmount,
        uint256 rewardsEarned,
        uint256 rewardsClaimed,
        Tier tier,
        uint256 lockedUntil,
        uint256 pendingRewards
    );
    
    function getTotalClaimableRewards(address user) external view returns (uint256);
    
    // State variables
    function totalStaked() external view returns (uint256);
    function totalUsers() external view returns (uint256);
    function escrowBalance() external view returns (uint256);
    function totalDistributed() external view returns (uint256);
}