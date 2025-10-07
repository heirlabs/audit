// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract DefAIEstateMinimal is ERC20, AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant MIN_INACTIVITY_PERIOD = 24 hours;
    uint256 public constant MAX_INACTIVITY_PERIOD = 300 * 365 days;
    uint256 public constant MIN_GRACE_PERIOD = 24 hours;
    uint256 public constant MAX_GRACE_PERIOD = 90 days;
    uint256 public constant MAX_BENEFICIARIES = 10;
    uint256 public constant ESTATE_FEE = 0.1 ether;
    uint256 public constant RWA_FEE = 0.01 ether;

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
        uint256 estateNumber;
        uint256 totalClaims;
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

    Counters.Counter private _estateIdCounter;
    Counters.Counter private _rwaIdCounter;

    mapping(uint256 => Estate) public estates;
    mapping(uint256 => RWA) public rwas;
    mapping(uint256 => mapping(address => ClaimRecord)) public claimRecords;

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

    event EstateCheckedIn(
        uint256 indexed estateId,
        address indexed owner,
        uint256 timestamp
    );

    event EstateLocked(
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

    constructor() ERC20("DefAI Estate Token", "ESTATE") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

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
            totalShares = totalShares + beneficiaries[i].share;
        }
        require(totalShares == 100, "Shares must sum to 100%");

        Estate storage estate = estates[estateId];
        
        delete estate.beneficiaries;
        
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

        estates[estateId].estateValue = estates[estateId].estateValue + value;

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
        estates[estateId].estateValue = estates[estateId].estateValue - rwas[rwaId].value;

        emit RWADeleted(rwaId, estateId, block.timestamp);
    }

    function triggerInheritance(uint256 estateId)
        external
        estateExists(estateId)
    {
        Estate storage estate = estates[estateId];
        require(!estate.isClaimable, "Already claimable");
        
        uint256 inactiveTime = block.timestamp - estate.lastActive;
        require(
            inactiveTime > estate.inactivityPeriod + estate.gracePeriod,
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
        uint256 solAmount = estateBalance * sharePercentage / 100;
        uint256 estateTokenAmount = balanceOf(estate.owner) * sharePercentage / 100;

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

    function getEstate(uint256 estateId) external view returns (Estate memory) {
        return estates[estateId];
    }

    function getRWA(uint256 rwaId) external view returns (RWA memory) {
        return rwas[rwaId];
    }

    function getClaimRecord(uint256 estateId, address beneficiary) 
        external view returns (ClaimRecord memory) {
        return claimRecords[estateId][beneficiary];
    }
}