// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IDefAIEstate {
    struct Estate {
        uint256 estateId;
        address owner;
        bytes32 ownerEmailHash;
        uint256 lastActive;
        uint256 inactivityPeriod;
        uint256 gracePeriod;
        uint256 totalBeneficiaries;
        uint256 creationTime;
        uint256 estateValue;
        bool isLocked;
        bool isClaimable;
        uint256 totalRWAs;
        uint256 estateNumber;
        uint256 totalClaims;
        bool tradingEnabled;
        address aiAgent;
        uint256 tradingStrategy;
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
    }
    
    function getEstate(uint256 estateId) external view returns (Estate memory);
}

contract EmergencyManager is AccessControl, Pausable {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IDefAIEstate public defaiEstate;

    enum LockType { 
        SecurityBreach, 
        LegalCompliance, 
        TechnicalIssue, 
        UserRequest,
        MultisigDecision 
    }

    struct EmergencyLock {
        uint256 estateId;
        LockType lockType;
        string reason;
        uint256 lockedAt;
        address lockedBy;
        bool isActive;
        uint256 unlockAttempts;
        uint256 lastUnlockAttempt;
    }

    struct EmergencyConfig {
        uint256 maxUnlockAttempts;
        uint256 unlockCooldown;
        uint256 emergencyPauseDuration;
        bool requireMultisigForUnlock;
        uint256 minGuardiansForAction;
    }

    mapping(uint256 => EmergencyLock) public emergencyLocks;
    mapping(uint256 => address[]) public estateGuardians;
    mapping(uint256 => mapping(address => bool)) public guardianApprovals;
    
    EmergencyConfig public config;

    event EmergencyLockInitiated(
        uint256 indexed estateId,
        LockType lockType,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event EmergencyUnlockSuccessful(
        uint256 indexed estateId,
        address indexed executor,
        uint256 attempts,
        uint256 timestamp
    );

    event EmergencyUnlockFailed(
        uint256 indexed estateId,
        address indexed attempter,
        string reason,
        uint256 timestamp
    );

    event EmergencyForceUnlock(
        uint256 indexed estateId,
        address indexed executor,
        address indexed multisig,
        uint256 timestamp
    );

    event GuardianAdded(
        uint256 indexed estateId,
        address indexed guardian,
        uint256 timestamp
    );

    event GuardianRemoved(
        uint256 indexed estateId,
        address indexed guardian,
        uint256 timestamp
    );

    event GuardianApproval(
        uint256 indexed estateId,
        address indexed guardian,
        bool approved,
        uint256 timestamp
    );

    modifier onlyEstateOwner(uint256 estateId) {
        IDefAIEstate.Estate memory estate = defaiEstate.getEstate(estateId);
        require(estate.owner == msg.sender, "Not estate owner");
        _;
    }

    modifier onlyEstateMultisig(uint256 estateId) {
        IDefAIEstate.Estate memory estate = defaiEstate.getEstate(estateId);
        require(estate.multisig == msg.sender, "Not estate multisig");
        _;
    }

    modifier lockNotActive(uint256 estateId) {
        require(!emergencyLocks[estateId].isActive, "Emergency lock is active");
        _;
    }

    modifier lockActive(uint256 estateId) {
        require(emergencyLocks[estateId].isActive, "Emergency lock is not active");
        _;
    }

    constructor(address _defaiEstate) {
        defaiEstate = IDefAIEstate(_defaiEstate);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GUARDIAN_ROLE, msg.sender);

        // Set default configuration
        config = EmergencyConfig({
            maxUnlockAttempts: 3,
            unlockCooldown: 24 hours,
            emergencyPauseDuration: 72 hours,
            requireMultisigForUnlock: true,
            minGuardiansForAction: 2
        });
    }

    // ===== Lock Functions =====
    function initiateEmergencyLock(
        uint256 estateId,
        LockType lockType,
        string memory reason
    ) external onlyEstateOwner(estateId) lockNotActive(estateId) {
        require(bytes(reason).length >= 5 && bytes(reason).length <= 200, "Invalid reason length");

        emergencyLocks[estateId] = EmergencyLock({
            estateId: estateId,
            lockType: lockType,
            reason: reason,
            lockedAt: block.timestamp,
            lockedBy: msg.sender,
            isActive: true,
            unlockAttempts: 0,
            lastUnlockAttempt: 0
        });

        emit EmergencyLockInitiated(estateId, lockType, reason, msg.sender, block.timestamp);
    }

    function attemptEmergencyUnlock(
        uint256 estateId,
        string memory /* unlockReason */
    ) external onlyEstateOwner(estateId) lockActive(estateId) {
        EmergencyLock storage lock = emergencyLocks[estateId];
        
        // Check cooldown period
        if (lock.unlockAttempts > 0) {
            require(
                block.timestamp >= lock.lastUnlockAttempt + config.unlockCooldown,
                "Cooldown period not elapsed"
            );
        }

        // Check max attempts
        require(
            lock.unlockAttempts < config.maxUnlockAttempts,
            "Max unlock attempts exceeded"
        );

        lock.unlockAttempts++;
        lock.lastUnlockAttempt = block.timestamp;

        // Check if multisig approval is required
        if (config.requireMultisigForUnlock) {
            uint256 approvals = _countGuardianApprovals(estateId);
            if (approvals < config.minGuardiansForAction) {
                emit EmergencyUnlockFailed(
                    estateId,
                    msg.sender,
                    "Insufficient guardian approvals",
                    block.timestamp
                );
                return;
            }
        }

        // Unlock successful
        lock.isActive = false;
        _resetGuardianApprovals(estateId);

        emit EmergencyUnlockSuccessful(
            estateId,
            msg.sender,
            lock.unlockAttempts,
            block.timestamp
        );
    }

    function forceUnlockByMultisig(
        uint256 estateId
    ) external onlyEstateMultisig(estateId) lockActive(estateId) {
        EmergencyLock storage lock = emergencyLocks[estateId];
        lock.isActive = false;
        _resetGuardianApprovals(estateId);

        emit EmergencyForceUnlock(
            estateId,
            msg.sender,
            msg.sender,
            block.timestamp
        );
    }

    // ===== Guardian Functions =====
    function addGuardian(
        uint256 estateId,
        address guardian
    ) external onlyEstateOwner(estateId) {
        require(guardian != address(0), "Invalid guardian address");
        require(!_isGuardian(estateId, guardian), "Already a guardian");

        estateGuardians[estateId].push(guardian);
        _grantRole(GUARDIAN_ROLE, guardian);

        emit GuardianAdded(estateId, guardian, block.timestamp);
    }

    function removeGuardian(
        uint256 estateId,
        address guardian
    ) external onlyEstateOwner(estateId) {
        require(_isGuardian(estateId, guardian), "Not a guardian");

        address[] storage guardians = estateGuardians[estateId];
        for (uint i = 0; i < guardians.length; i++) {
            if (guardians[i] == guardian) {
                guardians[i] = guardians[guardians.length - 1];
                guardians.pop();
                break;
            }
        }

        delete guardianApprovals[estateId][guardian];

        emit GuardianRemoved(estateId, guardian, block.timestamp);
    }

    function approveUnlock(
        uint256 estateId
    ) external lockActive(estateId) {
        require(hasRole(GUARDIAN_ROLE, msg.sender), "Not a guardian");
        require(_isGuardian(estateId, msg.sender), "Not guardian for this estate");

        guardianApprovals[estateId][msg.sender] = true;

        emit GuardianApproval(estateId, msg.sender, true, block.timestamp);
    }

    function revokeApproval(
        uint256 estateId
    ) external {
        require(hasRole(GUARDIAN_ROLE, msg.sender), "Not a guardian");
        require(_isGuardian(estateId, msg.sender), "Not guardian for this estate");

        guardianApprovals[estateId][msg.sender] = false;

        emit GuardianApproval(estateId, msg.sender, false, block.timestamp);
    }

    // ===== Configuration Functions =====
    function updateConfig(
        uint256 maxUnlockAttempts,
        uint256 unlockCooldown,
        uint256 emergencyPauseDuration,
        bool requireMultisigForUnlock,
        uint256 minGuardiansForAction
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        config = EmergencyConfig({
            maxUnlockAttempts: maxUnlockAttempts,
            unlockCooldown: unlockCooldown,
            emergencyPauseDuration: emergencyPauseDuration,
            requireMultisigForUnlock: requireMultisigForUnlock,
            minGuardiansForAction: minGuardiansForAction
        });
    }

    // ===== Global Emergency Functions =====
    function pauseAllOperations() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpauseAllOperations() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ===== View Functions =====
    function getEmergencyLock(uint256 estateId) external view returns (EmergencyLock memory) {
        return emergencyLocks[estateId];
    }

    function getEstateGuardians(uint256 estateId) external view returns (address[] memory) {
        return estateGuardians[estateId];
    }

    function isLocked(uint256 estateId) external view returns (bool) {
        return emergencyLocks[estateId].isActive;
    }

    function getGuardianApprovalCount(uint256 estateId) external view returns (uint256) {
        return _countGuardianApprovals(estateId);
    }

    function canUnlock(uint256 estateId) external view returns (bool) {
        EmergencyLock memory lock = emergencyLocks[estateId];
        
        if (!lock.isActive) return false;
        if (lock.unlockAttempts >= config.maxUnlockAttempts) return false;
        
        if (lock.unlockAttempts > 0) {
            if (block.timestamp < lock.lastUnlockAttempt + config.unlockCooldown) {
                return false;
            }
        }
        
        if (config.requireMultisigForUnlock) {
            uint256 approvals = _countGuardianApprovals(estateId);
            if (approvals < config.minGuardiansForAction) {
                return false;
            }
        }
        
        return true;
    }

    // ===== Internal Functions =====
    function _isGuardian(uint256 estateId, address account) private view returns (bool) {
        address[] memory guardians = estateGuardians[estateId];
        for (uint i = 0; i < guardians.length; i++) {
            if (guardians[i] == account) {
                return true;
            }
        }
        return false;
    }

    function _countGuardianApprovals(uint256 estateId) private view returns (uint256) {
        address[] memory guardians = estateGuardians[estateId];
        uint256 count = 0;
        
        for (uint i = 0; i < guardians.length; i++) {
            if (guardianApprovals[estateId][guardians[i]]) {
                count++;
            }
        }
        
        return count;
    }

    function _resetGuardianApprovals(uint256 estateId) private {
        address[] memory guardians = estateGuardians[estateId];
        
        for (uint i = 0; i < guardians.length; i++) {
            delete guardianApprovals[estateId][guardians[i]];
        }
    }
}