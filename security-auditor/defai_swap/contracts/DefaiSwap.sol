// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./mocks/VRFConsumerBaseV2Mock.sol";

contract DefaiSwap is Ownable, Pausable, ReentrancyGuard, VRFConsumerBaseV2 {
    using SafeERC20 for IERC20;

    // Tax configuration constants (basis points = parts per 10_000)
    uint16 public constant INITIAL_TAX_BPS = 500;     // 5%
    uint16 public constant TAX_INCREMENT_BPS = 100;   // 1% each swap
    uint16 public constant TAX_CAP_BPS = 3000;        // 30% maximum tax
    uint256 public constant TAX_RESET_DURATION = 24 hours;

    // Admin timelock
    uint256 public constant ADMIN_TIMELOCK_DURATION = 48 hours;

    // Vesting constants
    uint256 public constant VESTING_DURATION = 90 days;
    uint256 public constant CLIFF_DURATION = 2 days;

    // Bonus ranges per tier (basis points)
    uint16[2][5] public tierBonusRanges = [
        [uint16(0), uint16(0)],        // Tier 0: OG (No bonus)
        [uint16(0), uint16(1500)],     // Tier 1: Train (0-15%)
        [uint16(1500), uint16(5000)],  // Tier 2: Boat (15-50%)
        [uint16(2000), uint16(10000)], // Tier 3: Plane (20-100%)
        [uint16(5000), uint16(30000)]  // Tier 4: Rocket (50-300%)
    ];

    // State variables
    IERC20 public oldDefaiToken;
    IERC20 public defaiToken;
    IERC721 public nftCollection;
    address public treasury;
    uint256[5] public tierPrices;
    uint16[5] public tierSupplies;
    uint16[5] public tierMinted;
    
    // OG tier 0 specific
    bytes32 public ogTier0MerkleRoot;
    bytes32 public airdropMerkleRoot;
    uint16 public ogTier0Supply;
    uint16 public ogTier0Minted;

    // Admin transfer
    address public pendingAdmin;
    uint256 public adminChangeTimestamp;

    // Chainlink VRF
    VRFCoordinatorV2Interface public vrfCoordinator;
    uint64 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32 public vrfCallbackGasLimit = 100000;
    uint16 public vrfRequestConfirmations = 3;
    uint32 public vrfNumWords = 1;
    bool public vrfEnabled = true;

    // Mappings
    mapping(address => UserTaxState) public userTaxStates;
    mapping(uint256 => BonusState) public bonusStates;
    mapping(uint256 => VestingState) public vestingStates;
    mapping(address => bool) public ogTier0Claimed;
    mapping(address => AirdropVesting) public airdropVestings;
    mapping(uint256 => uint256) public vrfRequestToTokenId;
    mapping(uint256 => PendingSwap) public pendingSwaps;

    // Structs
    struct UserTaxState {
        uint16 taxRateBps;
        uint256 lastSwapTimestamp;
        uint32 swapCount;
    }

    struct BonusState {
        uint8 tier;
        uint16 bonusBps;
        uint256 vestingStart;
        bool claimed;
        uint256 feeDeducted;
    }

    struct VestingState {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 lastClaimedTimestamp;
    }

    struct AirdropVesting {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 lastClaimedTimestamp;
    }

    struct PendingSwap {
        address user;
        uint8 tier;
        uint256 tokenId;
        uint256 price;
        uint256 taxAmount;
        bool isOldDefai;
        bool isOgTier0;
        uint256 vestingAmount;
    }

    // Events
    event SwapExecuted(
        address indexed user,
        uint8 tier,
        uint256 price,
        uint256 taxAmount,
        uint16 bonusBps,
        uint256 indexed tokenId,
        uint256 timestamp
    );

    event RedemptionExecuted(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amountReturned,
        uint256 feesDeducted,
        uint256 timestamp
    );

    event VestingClaimed(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amountClaimed,
        uint256 totalVested,
        uint256 timestamp
    );

    event BonusRerolled(
        address indexed user,
        uint256 indexed tokenId,
        uint16 oldBonusBps,
        uint16 newBonusBps,
        uint256 taxPaid,
        uint256 timestamp
    );

    event AdminAction(
        address indexed admin,
        string action,
        uint256 timestamp
    );

    event TaxReset(
        address indexed user,
        uint16 oldRateBps,
        uint16 newRateBps,
        uint256 timestamp
    );

    event AirdropClaimed(
        address indexed user,
        uint256 amount,
        uint256 vestingStart,
        uint256 vestingEnd
    );

    constructor(
        address _oldDefaiToken,
        address _defaiToken,
        address _nftCollection,
        address _treasury,
        uint256[5] memory _prices,
        address _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        oldDefaiToken = IERC20(_oldDefaiToken);
        defaiToken = IERC20(_defaiToken);
        nftCollection = IERC721(_nftCollection);
        treasury = _treasury;
        tierPrices = _prices;
        
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        vrfSubscriptionId = _subscriptionId;
        vrfKeyHash = _keyHash;
    }

    // Initialize collection configuration
    function initializeCollection(
        uint16[5] memory _tierSupplies,
        bytes32 _ogTier0MerkleRoot,
        bytes32 _airdropMerkleRoot,
        uint16 _ogTier0Supply
    ) external onlyOwner {
        tierSupplies = _tierSupplies;
        ogTier0MerkleRoot = _ogTier0MerkleRoot;
        airdropMerkleRoot = _airdropMerkleRoot;
        ogTier0Supply = _ogTier0Supply;
    }

    // Update functions
    function updatePrices(uint256[5] memory _prices) external onlyOwner {
        tierPrices = _prices;
    }

    function updateTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function pause() external onlyOwner {
        _pause();
        emit AdminAction(msg.sender, "Pause protocol", block.timestamp);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit AdminAction(msg.sender, "Unpause protocol", block.timestamp);
    }

    function proposeAdminChange(address _newAdmin) external onlyOwner {
        pendingAdmin = _newAdmin;
        adminChangeTimestamp = block.timestamp + ADMIN_TIMELOCK_DURATION;
        emit AdminAction(msg.sender, string(abi.encodePacked("Propose admin change to ", _newAdmin)), block.timestamp);
    }

    function acceptAdminChange() external onlyOwner {
        require(pendingAdmin != address(0), "No pending admin");
        require(block.timestamp >= adminChangeTimestamp, "Timelock not expired");
        
        address oldAdmin = owner();
        _transferOwnership(pendingAdmin);
        pendingAdmin = address(0);
        adminChangeTimestamp = 0;
        
        emit AdminAction(oldAdmin, string(abi.encodePacked("Admin changed to ", pendingAdmin)), block.timestamp);
    }

    // Initialize user tax state
    function initializeUserTax() external {
        UserTaxState storage userTax = userTaxStates[msg.sender];
        if (userTax.taxRateBps == 0) {
            userTax.taxRateBps = INITIAL_TAX_BPS;
            userTax.lastSwapTimestamp = block.timestamp;
            userTax.swapCount = 0;
        }
    }

    // Reset user tax after 24 hours
    function resetUserTax() external {
        UserTaxState storage userTax = userTaxStates[msg.sender];
        require(block.timestamp >= userTax.lastSwapTimestamp + TAX_RESET_DURATION, "Tax reset too early");
        
        uint16 oldRate = userTax.taxRateBps;
        userTax.taxRateBps = INITIAL_TAX_BPS;
        userTax.swapCount = 0;
        
        emit TaxReset(msg.sender, oldRate, INITIAL_TAX_BPS, block.timestamp);
    }

    // Swap OG Tier 0 for NFT (MAY20DEFAIHolders.csv)
    function swapOgTier0ForNft(
        uint256 vestingAmount,
        bytes32[] calldata merkleProof,
        uint256 tokenId
    ) external whenNotPaused nonReentrant {
        require(!ogTier0Claimed[msg.sender], "Already claimed");
        require(ogTier0Minted < ogTier0Supply, "No supply");
        
        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, vestingAmount));
        require(MerkleProof.verify(merkleProof, ogTier0MerkleRoot, leaf), "Invalid proof");
        
        ogTier0Claimed[msg.sender] = true;
        ogTier0Minted++;
        
        // Store pending swap and request VRF
        PendingSwap storage pending = pendingSwaps[tokenId];
        pending.user = msg.sender;
        pending.tier = 0;
        pending.tokenId = tokenId;
        pending.price = 0; // Free for OG
        pending.taxAmount = 0;
        pending.isOgTier0 = true;
        pending.vestingAmount = vestingAmount;
        
        if (vrfEnabled) {
            uint256 requestId = vrfCoordinator.requestRandomWords(
                vrfKeyHash,
                vrfSubscriptionId,
                vrfRequestConfirmations,
                vrfCallbackGasLimit,
                vrfNumWords
            );
            vrfRequestToTokenId[requestId] = tokenId;
        } else {
            // Fallback to pseudo-random
            _completeSwapWithRandomness(tokenId, _generatePseudoRandom(tokenId));
        }
    }

    // Swap DEFAI for NFT
    function swapDefaiForNft(
        uint8 tier,
        uint256 tokenId
    ) external whenNotPaused nonReentrant {
        require(tier < 5, "Invalid tier");
        
        // Check supply
        if (tier == 0) {
            uint16 remainingSupply = tierSupplies[0] - ogTier0Supply;
            require(tierMinted[0] < remainingSupply, "No supply");
        } else {
            require(tierMinted[tier] < tierSupplies[tier], "No supply");
        }
        
        UserTaxState storage userTax = userTaxStates[msg.sender];
        
        // Initialize tax if needed
        if (userTax.taxRateBps == 0) {
            userTax.taxRateBps = INITIAL_TAX_BPS;
        }
        
        // Reset tax if 24 hours passed
        if (block.timestamp - userTax.lastSwapTimestamp >= TAX_RESET_DURATION) {
            userTax.taxRateBps = INITIAL_TAX_BPS;
            userTax.swapCount = 0;
        }
        
        uint256 price = tierPrices[tier];
        uint256 taxAmount = (price * userTax.taxRateBps) / 10000;
        uint256 netAmount = price - taxAmount;
        
        // Transfer tokens
        defaiToken.safeTransferFrom(msg.sender, treasury, taxAmount);
        defaiToken.safeTransferFrom(msg.sender, address(this), netAmount);
        
        // Update tax state
        userTax.taxRateBps = uint16(Math.min(userTax.taxRateBps + TAX_INCREMENT_BPS, TAX_CAP_BPS));
        userTax.swapCount++;
        userTax.lastSwapTimestamp = block.timestamp;
        
        tierMinted[tier]++;
        
        // Store pending swap
        PendingSwap storage pending = pendingSwaps[tokenId];
        pending.user = msg.sender;
        pending.tier = tier;
        pending.tokenId = tokenId;
        pending.price = price;
        pending.taxAmount = taxAmount;
        pending.isOldDefai = false;
        
        if (vrfEnabled) {
            uint256 requestId = vrfCoordinator.requestRandomWords(
                vrfKeyHash,
                vrfSubscriptionId,
                vrfRequestConfirmations,
                vrfCallbackGasLimit,
                vrfNumWords
            );
            vrfRequestToTokenId[requestId] = tokenId;
        } else {
            _completeSwapWithRandomness(tokenId, _generatePseudoRandom(tokenId));
        }
    }

    // Swap OLD DEFAI for NFT
    function swapOldDefaiForNft(
        uint8 tier,
        uint256 tokenId
    ) external whenNotPaused nonReentrant {
        require(tier < 5, "Invalid tier");
        
        // Check supply
        if (tier == 0) {
            uint16 remainingSupply = tierSupplies[0] - ogTier0Supply;
            require(tierMinted[0] < remainingSupply, "No supply");
        } else {
            require(tierMinted[tier] < tierSupplies[tier], "No supply");
        }
        
        uint256 price = tierPrices[tier];
        
        // Transfer OLD tokens to contract (not burn, can be sold later)
        oldDefaiToken.safeTransferFrom(msg.sender, address(this), price);
        
        UserTaxState storage userTax = userTaxStates[msg.sender];
        userTax.swapCount++;
        
        tierMinted[tier]++;
        
        // Store pending swap
        PendingSwap storage pending = pendingSwaps[tokenId];
        pending.user = msg.sender;
        pending.tier = tier;
        pending.tokenId = tokenId;
        pending.price = price;
        pending.taxAmount = 0; // No tax for old DEFAI
        pending.isOldDefai = true;
        
        if (vrfEnabled) {
            uint256 requestId = vrfCoordinator.requestRandomWords(
                vrfKeyHash,
                vrfSubscriptionId,
                vrfRequestConfirmations,
                vrfCallbackGasLimit,
                vrfNumWords
            );
            vrfRequestToTokenId[requestId] = tokenId;
        } else {
            _completeSwapWithRandomness(tokenId, _generatePseudoRandom(tokenId));
        }
    }

    // Chainlink VRF callback
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        uint256 tokenId = vrfRequestToTokenId[requestId];
        require(tokenId != 0, "Invalid request");
        
        _completeSwapWithRandomness(tokenId, randomWords[0]);
        delete vrfRequestToTokenId[requestId];
    }

    // Complete swap with randomness
    function _completeSwapWithRandomness(uint256 tokenId, uint256 randomValue) private {
        PendingSwap storage pending = pendingSwaps[tokenId];
        require(pending.user != address(0), "No pending swap");
        
        // Calculate random bonus
        uint16 minBonus = tierBonusRanges[pending.tier][0];
        uint16 maxBonus = tierBonusRanges[pending.tier][1];
        uint16 bonusBps = _calculateRandomBonus(randomValue, minBonus, maxBonus);
        
        // Set up bonus state
        BonusState storage bonusState = bonusStates[tokenId];
        bonusState.tier = pending.tier;
        bonusState.bonusBps = bonusBps;
        bonusState.vestingStart = block.timestamp;
        bonusState.claimed = false;
        bonusState.feeDeducted = 0;
        
        // Set up vesting state
        VestingState storage vestingState = vestingStates[tokenId];
        uint256 vestingAmount = pending.isOgTier0 ? 
            pending.vestingAmount : 
            (pending.price * bonusBps) / 10000;
        
        vestingState.totalAmount = vestingAmount;
        vestingState.releasedAmount = 0;
        vestingState.startTimestamp = block.timestamp;
        vestingState.endTimestamp = block.timestamp + VESTING_DURATION;
        vestingState.lastClaimedTimestamp = block.timestamp;
        
        // Mint NFT to user (requires NFT contract to support this)
        // nftCollection.mint(pending.user, tokenId);
        
        emit SwapExecuted(
            pending.user,
            pending.tier,
            pending.price,
            pending.taxAmount,
            bonusBps,
            tokenId,
            block.timestamp
        );
        
        delete pendingSwaps[tokenId];
    }

    // Redeem NFT for DEFAI
    function redeem(uint256 tokenId) external whenNotPaused nonReentrant {
        require(nftCollection.ownerOf(tokenId) == msg.sender, "Not owner");
        
        BonusState storage bonusState = bonusStates[tokenId];
        require(!bonusState.claimed, "Already redeemed");
        
        uint256 basePrice = tierPrices[bonusState.tier];
        uint256 amountToTransfer = basePrice - bonusState.feeDeducted;
        
        // Transfer base amount minus fees
        defaiToken.safeTransfer(msg.sender, amountToTransfer);
        
        // Burn NFT (requires NFT contract to support this)
        // nftCollection.burn(tokenId);
        
        bonusState.claimed = true;
        
        emit RedemptionExecuted(
            msg.sender,
            tokenId,
            amountToTransfer,
            bonusState.feeDeducted,
            block.timestamp
        );
    }

    // Claim vested tokens
    function claimVested(uint256 tokenId) external whenNotPaused nonReentrant {
        require(nftCollection.ownerOf(tokenId) == msg.sender, "Not owner");
        
        VestingState storage vestingState = vestingStates[tokenId];
        
        // Check cliff period
        require(block.timestamp >= vestingState.startTimestamp + CLIFF_DURATION, "Still in cliff");
        
        // Calculate vested amount
        uint256 elapsed = block.timestamp - vestingState.startTimestamp;
        uint256 duration = vestingState.endTimestamp - vestingState.startTimestamp;
        
        uint256 vestedAmount;
        if (elapsed >= duration) {
            vestedAmount = vestingState.totalAmount;
        } else {
            vestedAmount = (vestingState.totalAmount * elapsed) / duration;
        }
        
        uint256 claimable = vestedAmount - vestingState.releasedAmount;
        require(claimable > 0, "Nothing to claim");
        
        vestingState.releasedAmount += claimable;
        vestingState.lastClaimedTimestamp = block.timestamp;
        
        defaiToken.safeTransfer(msg.sender, claimable);
        
        emit VestingClaimed(
            msg.sender,
            tokenId,
            claimable,
            vestedAmount,
            block.timestamp
        );
    }

    // Claim airdrop (10_1AIR-Sheet1.csv)
    function claimAirdrop(
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused nonReentrant {
        AirdropVesting storage airdropVesting = airdropVestings[msg.sender];
        require(airdropVesting.totalAmount == 0, "Already claimed");
        
        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(MerkleProof.verify(merkleProof, airdropMerkleRoot, leaf), "Invalid proof");
        
        // Initialize vesting
        airdropVesting.totalAmount = amount;
        airdropVesting.releasedAmount = 0;
        airdropVesting.startTimestamp = block.timestamp;
        airdropVesting.endTimestamp = block.timestamp + VESTING_DURATION;
        airdropVesting.lastClaimedTimestamp = block.timestamp;
        
        emit AirdropClaimed(
            msg.sender,
            amount,
            block.timestamp,
            block.timestamp + VESTING_DURATION
        );
    }

    // Claim vested airdrop
    function claimVestedAirdrop() external whenNotPaused nonReentrant {
        AirdropVesting storage airdropVesting = airdropVestings[msg.sender];
        require(airdropVesting.totalAmount > 0, "No airdrop");
        
        // Check cliff
        require(block.timestamp >= airdropVesting.startTimestamp + CLIFF_DURATION, "Still in cliff");
        
        // Calculate vested amount
        uint256 elapsed = block.timestamp - airdropVesting.startTimestamp;
        uint256 duration = airdropVesting.endTimestamp - airdropVesting.startTimestamp;
        
        uint256 vestedAmount;
        if (elapsed >= duration) {
            vestedAmount = airdropVesting.totalAmount;
        } else {
            vestedAmount = (airdropVesting.totalAmount * elapsed) / duration;
        }
        
        uint256 claimable = vestedAmount - airdropVesting.releasedAmount;
        require(claimable > 0, "Nothing to claim");
        
        airdropVesting.releasedAmount += claimable;
        airdropVesting.lastClaimedTimestamp = block.timestamp;
        
        defaiToken.safeTransfer(msg.sender, claimable);
    }

    // Reroll bonus
    function rerollBonus(uint256 tokenId) external whenNotPaused nonReentrant {
        require(nftCollection.ownerOf(tokenId) == msg.sender, "Not owner");
        
        BonusState storage bonusState = bonusStates[tokenId];
        VestingState storage vestingState = vestingStates[tokenId];
        UserTaxState storage userTax = userTaxStates[msg.sender];
        
        uint256 basePrice = tierPrices[bonusState.tier];
        require(defaiToken.balanceOf(msg.sender) >= basePrice, "Insufficient balance");
        
        // Calculate tax
        uint256 taxAmount = (basePrice * userTax.taxRateBps) / 10000;
        
        uint16 oldBonusBps = bonusState.bonusBps;
        
        // Request new randomness
        if (vrfEnabled) {
            // Store reroll request - would need additional mapping
            revert("VRF reroll not implemented in this example");
        } else {
            uint256 randomValue = _generatePseudoRandom(tokenId);
            uint16 minBonus = tierBonusRanges[bonusState.tier][0];
            uint16 maxBonus = tierBonusRanges[bonusState.tier][1];
            uint16 newBonusBps = _calculateRandomBonus(randomValue, minBonus, maxBonus);
            
            // Update states
            bonusState.bonusBps = newBonusBps;
            bonusState.vestingStart = block.timestamp;
            bonusState.feeDeducted += taxAmount;
            
            uint256 newVestingAmount = (basePrice * newBonusBps) / 10000;
            vestingState.totalAmount = newVestingAmount;
            vestingState.releasedAmount = 0;
            vestingState.startTimestamp = block.timestamp;
            vestingState.endTimestamp = block.timestamp + VESTING_DURATION;
            
            // Update tax
            userTax.taxRateBps = uint16(Math.min(userTax.taxRateBps + TAX_INCREMENT_BPS, TAX_CAP_BPS));
            
            emit BonusRerolled(
                msg.sender,
                tokenId,
                oldBonusBps,
                newBonusBps,
                taxAmount,
                block.timestamp
            );
        }
    }

    // Admin withdraw
    function adminWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
        emit AdminAction(msg.sender, string(abi.encodePacked("Withdraw ", amount, " tokens")), block.timestamp);
    }

    // Helper functions
    function _calculateRandomBonus(uint256 randomValue, uint16 minBonus, uint16 maxBonus) private pure returns (uint16) {
        uint16 bonusRange = maxBonus - minBonus;
        if (bonusRange == 0) {
            return minBonus;
        }
        return minBonus + uint16(randomValue % (bonusRange + 1));
    }

    function _generatePseudoRandom(uint256 tokenId) private view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            tokenId,
            block.number
        )));
    }

}

// Math library
library Math {
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}