// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DefaiAppFactory is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct App {
        address creator;
        string name;
        string description;
        uint256 stakingRequirement;
        uint256 platformFee;
        uint256 createdAt;
        bool isActive;
    }

    // State variables
    IERC20 public stakingToken;
    address public treasury;
    uint256 public platformFeeBps; // Basis points (1% = 100)
    uint256 public appCounter;
    
    // Mappings
    mapping(uint256 => App) public apps;
    mapping(address => uint256[]) public userApps;
    mapping(address => mapping(uint256 => uint256)) public userStakes;
    
    // Events
    event TokenAddressUpdated(address indexed oldToken, address indexed newToken);
    event AppCreated(uint256 indexed appId, address indexed creator, string name);
    event AppStaked(uint256 indexed appId, address indexed user, uint256 amount);
    event AppUnstaked(uint256 indexed appId, address indexed user, uint256 amount);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event AppDeactivated(uint256 indexed appId);
    event AppReactivated(uint256 indexed appId);

    constructor(
        address _stakingToken,
        address _treasury,
        uint256 _platformFeeBps
    ) {
        require(_stakingToken != address(0), "Invalid token address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_platformFeeBps <= 10000, "Fee too high");
        
        stakingToken = IERC20(_stakingToken);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // Admin functions
    function updateStakingToken(address _newToken) external onlyOwner {
        require(_newToken != address(0), "Invalid token address");
        address oldToken = address(stakingToken);
        stakingToken = IERC20(_newToken);
        emit TokenAddressUpdated(oldToken, _newToken);
    }

    function updatePlatformFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= 10000, "Fee too high");
        uint256 oldFee = platformFeeBps;
        platformFeeBps = _newFeeBps;
        emit PlatformFeeUpdated(oldFee, _newFeeBps);
    }

    function updateTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury address");
        address oldTreasury = treasury;
        treasury = _newTreasury;
        emit TreasuryUpdated(oldTreasury, _newTreasury);
    }

    // App creation
    function createApp(
        string memory _name,
        string memory _description,
        uint256 _stakingRequirement
    ) external nonReentrant returns (uint256) {
        require(bytes(_name).length > 0, "Name required");
        require(bytes(_description).length > 0, "Description required");
        require(_stakingRequirement > 0, "Staking requirement must be > 0");
        
        uint256 appId = ++appCounter;
        
        apps[appId] = App({
            creator: msg.sender,
            name: _name,
            description: _description,
            stakingRequirement: _stakingRequirement,
            platformFee: platformFeeBps,
            createdAt: block.timestamp,
            isActive: true
        });
        
        userApps[msg.sender].push(appId);
        
        emit AppCreated(appId, msg.sender, _name);
        return appId;
    }

    // Staking functions
    function stakeOnApp(uint256 _appId, uint256 _amount) external nonReentrant {
        App memory app = apps[_appId];
        require(app.creator != address(0), "App does not exist");
        require(app.isActive, "App is not active");
        require(_amount >= app.stakingRequirement, "Below minimum stake");
        
        // Calculate platform fee
        uint256 fee = (_amount * app.platformFee) / 10000;
        uint256 netAmount = _amount - fee;
        
        // Transfer tokens
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        
        // Send fee to treasury
        if (fee > 0) {
            stakingToken.safeTransfer(treasury, fee);
        }
        
        // Update user stake
        userStakes[msg.sender][_appId] += netAmount;
        
        emit AppStaked(_appId, msg.sender, netAmount);
    }

    function unstakeFromApp(uint256 _appId, uint256 _amount) external nonReentrant {
        require(userStakes[msg.sender][_appId] >= _amount, "Insufficient stake");
        
        userStakes[msg.sender][_appId] -= _amount;
        stakingToken.safeTransfer(msg.sender, _amount);
        
        emit AppUnstaked(_appId, msg.sender, _amount);
    }

    // App management
    function deactivateApp(uint256 _appId) external {
        require(apps[_appId].creator == msg.sender, "Not app creator");
        require(apps[_appId].isActive, "Already inactive");
        
        apps[_appId].isActive = false;
        emit AppDeactivated(_appId);
    }

    function reactivateApp(uint256 _appId) external {
        require(apps[_appId].creator == msg.sender, "Not app creator");
        require(!apps[_appId].isActive, "Already active");
        
        apps[_appId].isActive = true;
        emit AppReactivated(_appId);
    }

    // View functions
    function getUserApps(address _user) external view returns (uint256[] memory) {
        return userApps[_user];
    }

    function getUserStake(address _user, uint256 _appId) external view returns (uint256) {
        return userStakes[_user][_appId];
    }

    function getActiveApps() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        
        // Count active apps
        for (uint256 i = 1; i <= appCounter; i++) {
            if (apps[i].isActive) {
                activeCount++;
            }
        }
        
        // Populate array
        uint256[] memory activeApps = new uint256[](activeCount);
        uint256 index = 0;
        
        for (uint256 i = 1; i <= appCounter; i++) {
            if (apps[i].isActive) {
                activeApps[index++] = i;
            }
        }
        
        return activeApps;
    }

    // Emergency functions
    function emergencyWithdraw(address _token) external onlyOwner {
        IERC20(_token).safeTransfer(owner(), IERC20(_token).balanceOf(address(this)));
    }
}