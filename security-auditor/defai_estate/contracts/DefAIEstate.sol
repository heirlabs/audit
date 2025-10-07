// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract DefAIEstate is ERC20, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    // ===== Roles =====
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MULTISIG_ROLE = keccak256("MULTISIG_ROLE");
    bytes32 public constant AI_AGENT_ROLE = keccak256("AI_AGENT_ROLE");

    // ===== Constants =====
    uint256 public constant MIN_INACTIVITY_PERIOD = 24 hours;
    uint256 public constant MAX_INACTIVITY_PERIOD = 300 * 365 days;
    uint256 public constant MIN_GRACE_PERIOD = 24 hours;
    uint256 public constant MAX_GRACE_PERIOD = 90 days;
    uint256 public constant MAX_BENEFICIARIES = 10;
    uint256 public constant ESTATE_FEE = 0.1 ether;
    uint256 public constant RWA_FEE = 0.01 ether;
    uint256 public constant MAX_PROFIT_SHARE = 50;
    uint256 public constant MIN_EMERGENCY_DELAY = 24 hours;
    uint256 public constant MAX_EMERGENCY_DELAY = 7 days;
    uint256 public constant ADMIN_TIMELOCK_DURATION = 48 hours;
    uint256 public constant MAX_SIGNERS = 10;
    uint256 public constant MIN_SIGNERS = 2;
    uint256 public constant RECOVERY_DELAY = 30 days;

    // ===== Enums =====
    enum TradingStrategy { Conservative, Balanced, Aggressive }
    enum ProposalAction { 
        EmergencyLock, 
        EmergencyUnlock, 
        ForceUnlock, 
        UpdateBeneficiaries, 
        EnableTrading, 
        DisableTrading 
    }
    enum RiskLimitType {
        MaxDrawdown,
        DailyLoss,
        PositionSize,
        ExposureLimit,
        VolatilityThreshold
    }

    // ===== Structs =====
    struct Beneficiary {
        address wallet;
        uint256 share;
        string name;
        string relationship;
        bytes32 emailHash;
    }

    struct Estate {
        uint256 estateId;
        address owner;
        bytes32 ownerEmailHash;
        uint256 lastActive;
        uint256 inactivityPeriod;
        uint256 gracePeriod;
        Beneficiary[] beneficiaries;
        uint256 totalBeneficiaries;
        uint256 creationTime;
        uint256 estateValue;
        bool isLocked;
        bool isClaimable;
        uint256 totalRWAs;
        uint256 estateNumber;
        uint256 totalClaims;
        // Trading fields
        bool tradingEnabled;
        address aiAgent;
        TradingStrategy tradingStrategy;
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
        RiskManagementSettings riskSettings;
    }

    struct RWA {
        uint256 rwaId;
        uint256 estateId;
        string assetType;
        string description;
        uint256 value;
        uint256 createdAt;
        bool isDeleted;
        address owner;
        string documentHash;
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

    struct RiskManagementSettings {
        uint256 maxPositionSize;
        uint256 maxDailyLoss;
        uint256 maxDrawdown;
        uint256 maxLeverage;
        uint256 minLiquidity;
        uint256 maxExposurePerAsset;
        uint256 maxTotalExposure;
        uint256 maxVolatilityThreshold;
        uint256 rebalanceFrequency;
        uint256 riskCheckInterval;
        bool allowHighRiskTrades;
        bool autoStopLossEnabled;
        uint256 defaultStopLoss;
        uint256 defaultTakeProfit;
        uint256 maxSlippage;
        uint256 maxGasPrice;
        TradingHours tradingHours;
        StrategyMix strategyMix;
    }

    struct TradingHours {
        uint8 startHour;
        uint8 endHour;
        uint8[] activeDays;
        string timezone;
    }

    struct StrategyMix {
        uint8 spotPercentage;
        uint8 derivativesPercentage;
        uint8 stablecoinPercentage;
        uint8 deFiPercentage;
    }

    struct Multisig {
        address[] signers;
        uint256 threshold;
        uint256 proposalCount;
        address admin;
        address pendingAdmin;
        uint256 adminChangeTimestamp;
    }

    struct Proposal {
        address multisig;
        address proposer;
        uint256 targetEstate;
        ProposalAction action;
        address[] approvals;
        bool executed;
        uint256 createdAt;
        uint256 proposalId;
        bytes data;
    }

    struct Recovery {
        uint256 estateId;
        address initiator;
        uint256 initiatedAt;
        bool executed;
        uint256 recoveryFee;
    }

    // ===== State Variables =====
    Counters.Counter private _estateIdCounter;
    Counters.Counter private _rwaIdCounter;
    Counters.Counter private _proposalIdCounter;

    mapping(uint256 => Estate) public estates;
    mapping(uint256 => RWA) public rwas;
    mapping(uint256 => mapping(address => ClaimRecord)) public claimRecords;
    mapping(uint256 => mapping(address => mapping(address => bool))) public tokenClaims;
    mapping(uint256 => mapping(address => bool)) public nftClaims;
    mapping(uint256 => Recovery) public recoveries;
    mapping(address => Multisig) public multisigs;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => uint256)) public estateVaults;

    // ===== Events =====
    event EstateCreated(
        uint256 indexed estateId,
        address indexed owner,
        uint256 estateNumber,
        uint256 inactivityPeriod,
        uint256 gracePeriod,
        uint256 timestamp
    );

    event BeneficiaryAdded(
        uint256 indexed estateId,
        address indexed beneficiary,
        uint256 share,
        string name,
        uint256 timestamp
    );

    event BeneficiaryRemoved(
        uint256 indexed estateId,
        address indexed beneficiary,
        uint256 timestamp
    );

    event EstateCheckedIn(
        uint256 indexed estateId,
        address indexed owner,
        uint256 timestamp
    );

    event EstateLocked(
        uint256 indexed estateId,
        uint256 timestamp
    );

    event EstateUnlocked(
        uint256 indexed estateId,
        uint256 timestamp
    );

    event InheritanceClaimed(
        uint256 indexed estateId,
        address indexed beneficiary,
        uint256 share,
        uint256 solAmount,
        uint256 estateTokenAmount,
        uint256 timestamp
    );

    event RWAAdded(
        uint256 indexed rwaId,
        uint256 indexed estateId,
        string assetType,
        uint256 value,
        uint256 timestamp
    );

    event RWADeleted(
        uint256 indexed rwaId,
        uint256 indexed estateId,
        uint256 timestamp
    );

    event TradingEnabled(
        uint256 indexed estateId,
        address indexed aiAgent,
        uint256 humanShare,
        uint256 aiShare,
        TradingStrategy strategy,
        uint256 timestamp
    );

    event TradingPaused(
        uint256 indexed estateId,
        uint256 timestamp
    );

    event TradingResumed(
        uint256 indexed estateId,
        uint256 timestamp
    );

    event TradingContribution(
        uint256 indexed estateId,
        address indexed contributor,
        bool isAI,
        uint256 amount,
        uint256 totalValue,
        uint256 timestamp
    );

    event TradingValueUpdated(
        uint256 indexed estateId,
        uint256 oldValue,
        uint256 newValue,
        int256 profitLoss,
        uint256 timestamp
    );

    event ProfitsDistributed(
        uint256 indexed estateId,
        uint256 totalProfit,
        uint256 humanProfit,
        uint256 aiProfit,
        uint256 timestamp
    );

    event EmergencyWithdrawalInitiated(
        uint256 indexed estateId,
        address indexed initiator,
        uint256 executeAfter,
        uint256 timestamp
    );

    event EmergencyWithdrawalExecuted(
        uint256 indexed estateId,
        address indexed executor,
        uint256 amountWithdrawn,
        uint256 timestamp
    );

    event MultisigCreated(
        address indexed multisigAddress,
        address[] signers,
        uint256 threshold,
        uint256 timestamp
    );

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        uint256 targetEstate,
        ProposalAction action,
        uint256 timestamp
    );

    event ProposalApproved(
        uint256 indexed proposalId,
        address indexed approver,
        uint256 totalApprovals,
        uint256 timestamp
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        address indexed executor,
        uint256 timestamp
    );

    event RecoveryInitiated(
        uint256 indexed estateId,
        address indexed initiator,
        uint256 recoveryFee,
        uint256 executeAfter,
        uint256 timestamp
    );

    event RecoveryExecuted(
        uint256 indexed estateId,
        address indexed executor,
        address newOwner,
        uint256 timestamp
    );

    event RiskSettingsUpdated(
        uint256 indexed estateId,
        uint256 maxPositionSize,
        uint256 maxDailyLoss,
        uint256 maxDrawdown,
        uint256 timestamp
    );

    event RiskLimitTriggered(
        uint256 indexed estateId,
        RiskLimitType limitType,
        uint256 currentValue,
        uint256 limitValue,
        uint256 timestamp
    );

    // ===== Modifiers =====
    modifier onlyEstateOwner(uint256 estateId) {
        require(estates[estateId].owner == msg.sender, "Not estate owner");
        _;
    }

    modifier estateNotLocked(uint256 estateId) {
        require(!estates[estateId].isLocked, "Estate is locked");
        _;
    }

    modifier estateNotClaimable(uint256 estateId) {
        require(!estates[estateId].isClaimable, "Estate is claimable");
        _;
    }

    modifier estateExists(uint256 estateId) {
        require(estates[estateId].owner != address(0), "Estate does not exist");
        _;
    }

    // ===== Constructor =====
    constructor() ERC20("DefAI Estate Token", "ESTATE") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ===== Estate Management Functions =====
    function createEstate(
        uint256 inactivityPeriod,
        uint256 gracePeriod,
        bytes32 ownerEmailHash
    ) external payable returns (uint256) {
        require(msg.value >= ESTATE_FEE, "Insufficient estate fee");
        require(
            inactivityPeriod >= MIN_INACTIVITY_PERIOD && 
            inactivityPeriod <= MAX_INACTIVITY_PERIOD,
            "Invalid inactivity period"
        );
        require(
            gracePeriod >= MIN_GRACE_PERIOD && 
            gracePeriod <= MAX_GRACE_PERIOD,
            "Invalid grace period"
        );

        uint256 estateId = _estateIdCounter.current();
        _estateIdCounter.increment();

        Estate storage estate = estates[estateId];
        estate.estateId = estateId;
        estate.owner = msg.sender;
        estate.ownerEmailHash = ownerEmailHash;
        estate.lastActive = block.timestamp;
        estate.inactivityPeriod = inactivityPeriod;
        estate.gracePeriod = gracePeriod;
        estate.creationTime = block.timestamp;
        estate.estateNumber = estateId;

        _mint(msg.sender, 1000000 * 10**decimals());

        emit EstateCreated(
            estateId,
            msg.sender,
            estateId,
            inactivityPeriod,
            gracePeriod,
            block.timestamp
        );

        return estateId;
    }

    function checkIn(uint256 estateId) 
        external 
        estateExists(estateId)
        onlyEstateOwner(estateId)
        estateNotLocked(estateId)
        estateNotClaimable(estateId)
    {
        estates[estateId].lastActive = block.timestamp;
        
        emit EstateCheckedIn(estateId, msg.sender, block.timestamp);
    }

    function updateBeneficiaries(
        uint256 estateId,
        Beneficiary[] memory beneficiaries
    ) 
        external 
        estateExists(estateId)
        onlyEstateOwner(estateId)
        estateNotLocked(estateId)
        estateNotClaimable(estateId)
    {
        require(beneficiaries.length <= MAX_BENEFICIARIES, "Too many beneficiaries");
        
        uint256 totalShares = 0;
        for (uint i = 0; i < beneficiaries.length; i++) {
            totalShares = totalShares.add(beneficiaries[i].share);
        }
        require(totalShares == 100, "Shares must sum to 100%");

        Estate storage estate = estates[estateId];
        
        // Clear existing beneficiaries
        delete estate.beneficiaries;
        
        // Add new beneficiaries
        for (uint i = 0; i < beneficiaries.length; i++) {
            estate.beneficiaries.push(beneficiaries[i]);
            
            emit BeneficiaryAdded(
                estateId,
                beneficiaries[i].wallet,
                beneficiaries[i].share,
                beneficiaries[i].name,
                block.timestamp
            );
        }
        
        estate.totalBeneficiaries = beneficiaries.length;
    }

    // ===== RWA Functions =====
    function createRWA(
        uint256 estateId,
        string memory assetType,
        string memory description,
        uint256 value,
        string memory documentHash
    )
        external
        payable
        estateExists(estateId)
        onlyEstateOwner(estateId)
        estateNotLocked(estateId)
        estateNotClaimable(estateId)
        returns (uint256)
    {
        require(msg.value >= RWA_FEE, "Insufficient RWA fee");
        
        uint256 rwaId = _rwaIdCounter.current();
        _rwaIdCounter.increment();

        RWA storage rwa = rwas[rwaId];
        rwa.rwaId = rwaId;
        rwa.estateId = estateId;
        rwa.assetType = assetType;
        rwa.description = description;
        rwa.value = value;
        rwa.createdAt = block.timestamp;
        rwa.owner = msg.sender;
        rwa.documentHash = documentHash;

        estates[estateId].totalRWAs++;
        estates[estateId].estateValue = estates[estateId].estateValue.add(value);

        emit RWAAdded(rwaId, estateId, assetType, value, block.timestamp);

        return rwaId;
    }

    function deleteRWA(uint256 rwaId, uint256 estateId)
        external
        estateExists(estateId)
        onlyEstateOwner(estateId)
        estateNotLocked(estateId)
        estateNotClaimable(estateId)
    {
        require(rwas[rwaId].estateId == estateId, "RWA not in estate");
        require(!rwas[rwaId].isDeleted, "RWA already deleted");

        rwas[rwaId].isDeleted = true;
        estates[estateId].totalRWAs--;
        estates[estateId].estateValue = estates[estateId].estateValue.sub(rwas[rwaId].value);

        emit RWADeleted(rwaId, estateId, block.timestamp);
    }

    // ===== Trading Functions =====
    function enableTrading(
        uint256 estateId,
        address aiAgent,
        uint256 humanShare,
        TradingStrategy strategy,
        uint256 stopLoss,
        uint256 emergencyDelayHours
    )
        external
        estateExists(estateId)
        onlyEstateOwner(estateId)
        estateNotLocked(estateId)
        estateNotClaimable(estateId)
    {
        Estate storage estate = estates[estateId];
        require(!estate.tradingEnabled, "Trading already enabled");
        require(humanShare >= 50 && humanShare <= 100, "Invalid profit share");
        require(
            emergencyDelayHours >= MIN_EMERGENCY_DELAY / 1 hours && 
            emergencyDelayHours <= MAX_EMERGENCY_DELAY / 1 hours,
            "Invalid emergency delay"
        );

        estate.tradingEnabled = true;
        estate.aiAgent = aiAgent;
        estate.tradingStrategy = strategy;
        estate.humanShare = humanShare;
        estate.aiShare = 100 - humanShare;
        estate.stopLoss = stopLoss;
        estate.emergencyDelayHours = emergencyDelayHours;
        estate.lastTradingUpdate = block.timestamp;

        // Initialize risk settings based on strategy
        if (strategy == TradingStrategy.Conservative) {
            estate.riskSettings = _getConservativeSettings();
        } else if (strategy == TradingStrategy.Balanced) {
            estate.riskSettings = _getBalancedSettings();
        } else {
            estate.riskSettings = _getAggressiveSettings();
        }

        _grantRole(AI_AGENT_ROLE, aiAgent);

        emit TradingEnabled(
            estateId,
            aiAgent,
            humanShare,
            100 - humanShare,
            strategy,
            block.timestamp
        );
    }

    function pauseTrading(uint256 estateId)
        external
        estateExists(estateId)
        onlyEstateOwner(estateId)
        estateNotLocked(estateId)
        estateNotClaimable(estateId)
    {
        Estate storage estate = estates[estateId];
        require(estate.tradingEnabled, "Trading not enabled");

        estate.tradingEnabled = false;
        estate.lastTradingUpdate = block.timestamp;

        emit TradingPaused(estateId, block.timestamp);
    }

    function contributeToTrading(uint256 estateId) 
        external 
        payable
        estateExists(estateId)
        nonReentrant
    {
        Estate storage estate = estates[estateId];
        require(estate.tradingEnabled, "Trading not enabled");
        require(!estate.isLocked, "Estate is locked");
        require(!estate.isClaimable, "Estate is claimable");

        bool isAI = hasRole(AI_AGENT_ROLE, msg.sender);
        require(
            msg.sender == estate.owner || isAI,
            "Unauthorized contributor"
        );

        if (isAI) {
            estate.aiContribution = estate.aiContribution.add(msg.value);
        } else {
            estate.humanContribution = estate.humanContribution.add(msg.value);
        }

        estate.tradingValue = estate.tradingValue.add(msg.value);
        estate.lastTradingUpdate = block.timestamp;

        estateVaults[estateId][address(0)] = estateVaults[estateId][address(0)].add(msg.value);

        emit TradingContribution(
            estateId,
            msg.sender,
            isAI,
            msg.value,
            estate.tradingValue,
            block.timestamp
        );
    }

    function updateTradingValue(uint256 estateId, uint256 newValue)
        external
        estateExists(estateId)
    {
        Estate storage estate = estates[estateId];
        require(estate.tradingEnabled, "Trading not enabled");
        require(hasRole(AI_AGENT_ROLE, msg.sender), "Not AI agent");

        uint256 oldValue = estate.tradingValue;
        int256 profitLoss = int256(newValue) - int256(oldValue);
        
        estate.tradingValue = newValue;
        
        if (profitLoss > 0) {
            estate.tradingProfit = estate.tradingProfit.add(uint256(profitLoss));
            if (newValue > estate.highWaterMark) {
                estate.highWaterMark = newValue;
            }
        }

        // Check stop loss
        if (estate.stopLoss > 0) {
            uint256 maxLoss = estate.humanContribution.add(estate.aiContribution).mul(estate.stopLoss).div(100);
            if (oldValue > newValue && oldValue - newValue > maxLoss) {
                estate.tradingEnabled = false;
                emit TradingPaused(estateId, block.timestamp);
            }
        }

        // Check risk limits
        _checkRiskLimits(estateId, estate);

        estate.lastTradingUpdate = block.timestamp;

        emit TradingValueUpdated(
            estateId,
            oldValue,
            newValue,
            profitLoss,
            block.timestamp
        );
    }

    function distributeTradingProfits(uint256 estateId)
        external
        estateExists(estateId)
        nonReentrant
    {
        Estate storage estate = estates[estateId];
        require(estate.tradingEnabled, "Trading not enabled");
        require(estate.tradingProfit > 0, "No profits to distribute");

        uint256 totalProfit = estate.tradingProfit;
        uint256 humanProfit = totalProfit.mul(estate.humanShare).div(100);
        uint256 aiProfit = totalProfit.sub(humanProfit);

        estate.tradingProfit = 0;

        // Transfer profits
        if (humanProfit > 0) {
            payable(estate.owner).transfer(humanProfit);
        }
        if (aiProfit > 0 && estate.aiAgent != address(0)) {
            payable(estate.aiAgent).transfer(aiProfit);
        }

        emit ProfitsDistributed(
            estateId,
            totalProfit,
            humanProfit,
            aiProfit,
            block.timestamp
        );
    }

    // ===== Emergency Functions =====
    function initiateTradingEmergencyWithdrawal(uint256 estateId)
        external
        estateExists(estateId)
        onlyEstateOwner(estateId)
    {
        Estate storage estate = estates[estateId];
        require(estate.tradingEnabled, "Trading not enabled");
        require(!estate.emergencyWithdrawalInitiated, "Already initiated");

        estate.emergencyWithdrawalInitiated = true;
        estate.emergencyWithdrawalTime = block.timestamp.add(estate.emergencyDelayHours.mul(1 hours));

        emit EmergencyWithdrawalInitiated(
            estateId,
            msg.sender,
            estate.emergencyWithdrawalTime,
            block.timestamp
        );
    }

    function executeTradingEmergencyWithdrawal(uint256 estateId)
        external
        estateExists(estateId)
        onlyEstateOwner(estateId)
        nonReentrant
    {
        Estate storage estate = estates[estateId];
        require(estate.emergencyWithdrawalInitiated, "Not initiated");
        require(block.timestamp >= estate.emergencyWithdrawalTime, "Delay not passed");

        uint256 withdrawAmount = estate.tradingValue;
        estate.tradingValue = 0;
        estate.tradingEnabled = false;
        estate.emergencyWithdrawalInitiated = false;
        estate.emergencyWithdrawalTime = 0;

        if (withdrawAmount > 0) {
            payable(msg.sender).transfer(withdrawAmount);
        }

        emit EmergencyWithdrawalExecuted(
            estateId,
            msg.sender,
            withdrawAmount,
            block.timestamp
        );
    }

    // ===== Inheritance Functions =====
    function triggerInheritance(uint256 estateId)
        external
        estateExists(estateId)
    {
        Estate storage estate = estates[estateId];
        require(!estate.isClaimable, "Already claimable");
        
        uint256 inactiveTime = block.timestamp.sub(estate.lastActive);
        require(
            inactiveTime > estate.inactivityPeriod.add(estate.gracePeriod),
            "Not yet claimable"
        );

        estate.isClaimable = true;

        emit EstateLocked(estateId, block.timestamp);
    }

    function claimInheritance(uint256 estateId, uint256 beneficiaryIndex)
        external
        estateExists(estateId)
        nonReentrant
    {
        Estate storage estate = estates[estateId];
        require(estate.isClaimable, "Estate not claimable");
        require(beneficiaryIndex < estate.beneficiaries.length, "Invalid beneficiary");
        
        Beneficiary memory beneficiary = estate.beneficiaries[beneficiaryIndex];
        require(beneficiary.wallet == msg.sender, "Not authorized beneficiary");
        
        ClaimRecord storage claim = claimRecords[estateId][msg.sender];
        require(!claim.claimed, "Already claimed");

        uint256 sharePercentage = beneficiary.share;
        uint256 estateBalance = address(this).balance;
        uint256 solAmount = estateBalance.mul(sharePercentage).div(100);
        uint256 estateTokenAmount = balanceOf(estate.owner).mul(sharePercentage).div(100);

        claim.estateId = estateId;
        claim.beneficiary = msg.sender;
        claim.sharePercentage = sharePercentage;
        claim.claimTime = block.timestamp;
        claim.solAmount = solAmount;
        claim.estateTokenAmount = estateTokenAmount;
        claim.claimed = true;

        estate.totalClaims++;

        if (solAmount > 0) {
            payable(msg.sender).transfer(solAmount);
        }

        if (estateTokenAmount > 0) {
            _transfer(estate.owner, msg.sender, estateTokenAmount);
        }

        emit InheritanceClaimed(
            estateId,
            msg.sender,
            sharePercentage,
            solAmount,
            estateTokenAmount,
            block.timestamp
        );
    }

    // ===== Multisig Functions =====
    function initializeMultisig(
        address[] memory signers,
        uint256 threshold
    ) external {
        require(signers.length >= MIN_SIGNERS && signers.length <= MAX_SIGNERS, "Invalid signer count");
        require(threshold > 1 && threshold <= signers.length, "Invalid threshold");

        Multisig storage multisig = multisigs[msg.sender];
        multisig.signers = signers;
        multisig.threshold = threshold;
        multisig.admin = msg.sender;

        emit MultisigCreated(msg.sender, signers, threshold, block.timestamp);
    }

    function createProposal(
        uint256 targetEstate,
        ProposalAction action,
        bytes memory data
    ) external returns (uint256) {
        Multisig storage multisig = multisigs[msg.sender];
        require(_isSigner(multisig, msg.sender), "Not a signer");

        uint256 proposalId = _proposalIdCounter.current();
        _proposalIdCounter.increment();

        Proposal storage proposal = proposals[proposalId];
        proposal.multisig = msg.sender;
        proposal.proposer = msg.sender;
        proposal.targetEstate = targetEstate;
        proposal.action = action;
        proposal.createdAt = block.timestamp;
        proposal.proposalId = proposalId;
        proposal.data = data;
        proposal.approvals.push(msg.sender);

        emit ProposalCreated(proposalId, msg.sender, targetEstate, action, block.timestamp);

        return proposalId;
    }

    function approveProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        Multisig storage multisig = multisigs[proposal.multisig];
        
        require(_isSigner(multisig, msg.sender), "Not a signer");
        require(!_hasApproved(proposal, msg.sender), "Already approved");
        require(!proposal.executed, "Already executed");

        proposal.approvals.push(msg.sender);

        emit ProposalApproved(
            proposalId,
            msg.sender,
            proposal.approvals.length,
            block.timestamp
        );
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        Multisig storage multisig = multisigs[proposal.multisig];
        
        require(proposal.approvals.length >= multisig.threshold, "Insufficient approvals");
        require(!proposal.executed, "Already executed");

        proposal.executed = true;

        // Execute the proposal action
        if (proposal.action == ProposalAction.EmergencyLock) {
            estates[proposal.targetEstate].isLocked = true;
            emit EstateLocked(proposal.targetEstate, block.timestamp);
        } else if (proposal.action == ProposalAction.EmergencyUnlock) {
            estates[proposal.targetEstate].isLocked = false;
            emit EstateUnlocked(proposal.targetEstate, block.timestamp);
        }
        // Add more action executions as needed

        emit ProposalExecuted(proposalId, msg.sender, block.timestamp);
    }

    // ===== Recovery Functions =====
    function initiateRecovery(uint256 estateId) 
        external 
        payable
        estateExists(estateId)
    {
        Estate storage estate = estates[estateId];
        require(estate.isClaimable, "Estate not claimable");
        
        uint256 claimableTime = estate.lastActive.add(estate.inactivityPeriod).add(estate.gracePeriod);
        require(
            block.timestamp >= claimableTime.add(RECOVERY_DELAY),
            "Recovery too early"
        );

        require(msg.value >= 0.5 ether, "Insufficient recovery fee");

        Recovery storage recovery = recoveries[estateId];
        require(!recovery.executed, "Recovery already executed");

        recovery.estateId = estateId;
        recovery.initiator = msg.sender;
        recovery.initiatedAt = block.timestamp;
        recovery.recoveryFee = msg.value;

        emit RecoveryInitiated(
            estateId,
            msg.sender,
            msg.value,
            block.timestamp.add(7 days),
            block.timestamp
        );
    }

    function executeRecovery(uint256 estateId)
        external
        estateExists(estateId)
    {
        Recovery storage recovery = recoveries[estateId];
        require(recovery.initiator == msg.sender, "Not recovery initiator");
        require(!recovery.executed, "Already executed");
        require(
            block.timestamp >= recovery.initiatedAt.add(7 days),
            "Recovery timelock not passed"
        );

        recovery.executed = true;
        
        Estate storage estate = estates[estateId];
        estate.owner = msg.sender;
        estate.isClaimable = false;
        estate.isLocked = false;
        estate.lastActive = block.timestamp;

        emit RecoveryExecuted(
            estateId,
            msg.sender,
            msg.sender,
            block.timestamp
        );
    }

    // ===== Helper Functions =====
    function _getConservativeSettings() private pure returns (RiskManagementSettings memory) {
        return RiskManagementSettings({
            maxPositionSize: 10000 * 10**18,
            maxDailyLoss: 200 * 10**18,
            maxDrawdown: 500 * 10**18,
            maxLeverage: 2,
            minLiquidity: 5000 * 10**18,
            maxExposurePerAsset: 2000 * 10**18,
            maxTotalExposure: 8000 * 10**18,
            maxVolatilityThreshold: 20,
            rebalanceFrequency: 7 days,
            riskCheckInterval: 1 hours,
            allowHighRiskTrades: false,
            autoStopLossEnabled: true,
            defaultStopLoss: 5,
            defaultTakeProfit: 10,
            maxSlippage: 1,
            maxGasPrice: 100 gwei,
            tradingHours: TradingHours({
                startHour: 9,
                endHour: 17,
                activeDays: new uint8[](5),
                timezone: "UTC"
            }),
            strategyMix: StrategyMix({
                spotPercentage: 70,
                derivativesPercentage: 10,
                stablecoinPercentage: 15,
                deFiPercentage: 5
            })
        });
    }

    function _getBalancedSettings() private pure returns (RiskManagementSettings memory) {
        return RiskManagementSettings({
            maxPositionSize: 25000 * 10**18,
            maxDailyLoss: 1000 * 10**18,
            maxDrawdown: 2000 * 10**18,
            maxLeverage: 5,
            minLiquidity: 2000 * 10**18,
            maxExposurePerAsset: 5000 * 10**18,
            maxTotalExposure: 20000 * 10**18,
            maxVolatilityThreshold: 40,
            rebalanceFrequency: 3 days,
            riskCheckInterval: 30 minutes,
            allowHighRiskTrades: true,
            autoStopLossEnabled: true,
            defaultStopLoss: 10,
            defaultTakeProfit: 20,
            maxSlippage: 2,
            maxGasPrice: 200 gwei,
            tradingHours: TradingHours({
                startHour: 0,
                endHour: 23,
                activeDays: new uint8[](7),
                timezone: "UTC"
            }),
            strategyMix: StrategyMix({
                spotPercentage: 50,
                derivativesPercentage: 25,
                stablecoinPercentage: 15,
                deFiPercentage: 10
            })
        });
    }

    function _getAggressiveSettings() private pure returns (RiskManagementSettings memory) {
        return RiskManagementSettings({
            maxPositionSize: 50000 * 10**18,
            maxDailyLoss: 5000 * 10**18,
            maxDrawdown: 10000 * 10**18,
            maxLeverage: 10,
            minLiquidity: 1000 * 10**18,
            maxExposurePerAsset: 15000 * 10**18,
            maxTotalExposure: 45000 * 10**18,
            maxVolatilityThreshold: 80,
            rebalanceFrequency: 1 days,
            riskCheckInterval: 15 minutes,
            allowHighRiskTrades: true,
            autoStopLossEnabled: false,
            defaultStopLoss: 20,
            defaultTakeProfit: 40,
            maxSlippage: 5,
            maxGasPrice: 500 gwei,
            tradingHours: TradingHours({
                startHour: 0,
                endHour: 23,
                activeDays: new uint8[](7),
                timezone: "UTC"
            }),
            strategyMix: StrategyMix({
                spotPercentage: 30,
                derivativesPercentage: 40,
                stablecoinPercentage: 10,
                deFiPercentage: 20
            })
        });
    }

    function _checkRiskLimits(uint256 estateId, Estate storage estate) private {
        RiskManagementSettings memory settings = estate.riskSettings;
        
        // Check max position size
        if (estate.tradingValue > settings.maxPositionSize) {
            emit RiskLimitTriggered(
                estateId,
                RiskLimitType.PositionSize,
                estate.tradingValue,
                settings.maxPositionSize,
                block.timestamp
            );
        }

        // Check max drawdown
        if (estate.highWaterMark > 0) {
            uint256 drawdown = estate.highWaterMark.sub(estate.tradingValue);
            if (drawdown > settings.maxDrawdown) {
                estate.tradingEnabled = false;
                emit RiskLimitTriggered(
                    estateId,
                    RiskLimitType.MaxDrawdown,
                    drawdown,
                    settings.maxDrawdown,
                    block.timestamp
                );
            }
        }
    }

    function _isSigner(Multisig memory multisig, address account) private pure returns (bool) {
        for (uint i = 0; i < multisig.signers.length; i++) {
            if (multisig.signers[i] == account) {
                return true;
            }
        }
        return false;
    }

    function _hasApproved(Proposal memory proposal, address account) private pure returns (bool) {
        for (uint i = 0; i < proposal.approvals.length; i++) {
            if (proposal.approvals[i] == account) {
                return true;
            }
        }
        return false;
    }

    // ===== View Functions =====
    function getEstate(uint256 estateId) external view returns (Estate memory) {
        return estates[estateId];
    }

    function getRWA(uint256 rwaId) external view returns (RWA memory) {
        return rwas[rwaId];
    }

    function getClaimRecord(uint256 estateId, address beneficiary) external view returns (ClaimRecord memory) {
        return claimRecords[estateId][beneficiary];
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getMultisig(address multisigAddress) external view returns (Multisig memory) {
        return multisigs[multisigAddress];
    }

    function getRecovery(uint256 estateId) external view returns (Recovery memory) {
        return recoveries[estateId];
    }
}