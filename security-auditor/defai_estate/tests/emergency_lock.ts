import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DefaiEstate } from "../target/types/defai_estate";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import * as crypto from "crypto";

describe("Emergency Lock System", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DefaiEstate as Program<DefaiEstate>;
  const wallet = provider.wallet as anchor.Wallet;

  // Test accounts
  let owner: Keypair;
  let estate: PublicKey;
  let emergencyState: PublicKey;
  let globalCounter: PublicKey;
  let estateMint: Keypair;
  let verificationCode: string;
  
  // Multisig accounts
  let multisig: PublicKey;
  let signers: Keypair[];
  let proposal: PublicKey;

  before(async () => {
    // Setup test accounts
    owner = Keypair.generate();
    estateMint = Keypair.generate();
    signers = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    
    // Airdrop SOL
    await provider.connection.requestAirdrop(owner.publicKey, 10 * LAMPORTS_PER_SOL);
    for (const signer of signers) {
      await provider.connection.requestAirdrop(signer.publicKey, LAMPORTS_PER_SOL);
    }
    
    // Wait for airdrops
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Initialize global counter
    [globalCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      program.programId
    );

    try {
      await program.methods
        .initializeGlobalCounter()
        .accounts({
          admin: wallet.publicKey,
          globalCounter,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Counter might already exist
    }

    // Create estate
    const globalCounterAccount = await program.account.globalCounter.fetch(globalCounter);
    const estateNumber = globalCounterAccount.count;
    
    [estate] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("estate"),
        owner.publicKey.toBuffer(),
        estateNumber.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    const ownerEmailHash = crypto.randomBytes(32);
    const inactivityPeriod = new anchor.BN(30 * 24 * 60 * 60); // 30 days
    const gracePeriod = new anchor.BN(7 * 24 * 60 * 60); // 7 days
    const beneficiaries = [
      {
        address: Keypair.generate().publicKey,
        emailHash: Array.from(crypto.randomBytes(32)),
        sharePercentage: 100,
        claimed: false,
        isMultisig: false,
      }
    ];

    await program.methods
      .createEstate(
        Array.from(ownerEmailHash),
        inactivityPeriod,
        gracePeriod,
        beneficiaries
      )
      .accounts({
        owner: owner.publicKey,
        estate,
        globalCounter,
        estateMint: estateMint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    // Derive emergency state PDA
    [emergencyState] = PublicKey.findProgramAddressSync(
      [Buffer.from("emergency_lock"), estate.toBuffer()],
      program.programId
    );

    // Initialize multisig
    [multisig] = PublicKey.findProgramAddressSync(
      [Buffer.from("multisig"), owner.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeMultisig(
        signers.map(s => s.publicKey),
        2 // threshold
      )
      .accounts({
        admin: owner.publicKey,
        multisig,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    // Attach multisig to estate
    await program.methods
      .attachMultisig()
      .accounts({
        owner: owner.publicKey,
        estate,
        multisig,
      })
      .signers([owner])
      .rpc();

    // Generate verification code
    verificationCode = crypto.randomBytes(16).toString('hex');
  });

  describe("Legacy Emergency Lock", () => {
    it("Should lock estate using legacy function", async () => {
      await program.methods
        .emergencyLock()
        .accounts({
          owner: owner.publicKey,
          estate,
        })
        .signers([owner])
        .rpc();

      const estateAccount = await program.account.estate.fetch(estate);
      assert.isTrue(estateAccount.isLocked, "Estate should be locked");
    });

    it("Should unlock estate using legacy function", async () => {
      const verificationBytes = Array.from(crypto.randomBytes(32));
      
      await program.methods
        .emergencyUnlock(verificationBytes)
        .accounts({
          owner: owner.publicKey,
          estate,
        })
        .signers([owner])
        .rpc();

      const estateAccount = await program.account.estate.fetch(estate);
      assert.isFalse(estateAccount.isLocked, "Estate should be unlocked");
    });

    it("Should reject lock from non-owner", async () => {
      const hacker = Keypair.generate();
      await provider.connection.requestAirdrop(hacker.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        await program.methods
          .emergencyLock()
          .accounts({
            owner: hacker.publicKey,
            estate,
          })
          .signers([hacker])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.include(err.toString(), "UnauthorizedAccess");
      }
    });
  });

  describe("Improved Emergency Lock", () => {
    it("Should lock estate with proper tracking", async () => {
      const reason = "Suspicious activity detected on account";
      const lockType = { userInitiated: {} };

      await program.methods
        .emergencyLockImproved(reason, lockType, verificationCode)
        .accounts({
          authority: owner.publicKey,
          estate,
          emergencyState,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([owner])
        .rpc();

      const estateAccount = await program.account.estate.fetch(estate);
      assert.isTrue(estateAccount.isLocked, "Estate should be locked");

      const emergencyStateAccount = await program.account.emergencyLockState.fetch(emergencyState);
      assert.equal(emergencyStateAccount.lockReason, reason);
      assert.equal(emergencyStateAccount.lockCount.toNumber(), 1);
      assert.equal(emergencyStateAccount.initiatedBy.toBase58(), owner.publicKey.toBase58());
    });

    it("Should reject lock during cooldown period", async () => {
      const reason = "Another lock attempt";
      const lockType = { userInitiated: {} };

      // First unlock the estate
      await program.methods
        .emergencyUnlockImproved(verificationCode)
        .accounts({
          authority: owner.publicKey,
          estate,
          emergencyState,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([owner])
        .rpc();

      // Try to lock again immediately
      try {
        await program.methods
          .emergencyLockImproved(reason, lockType, verificationCode)
          .accounts({
            authority: owner.publicKey,
            estate,
            emergencyState,
            systemProgram: SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have thrown cooldown error");
      } catch (err) {
        assert.include(err.toString(), "EmergencyLockCooldown");
      }
    });

    it("Should unlock with correct verification code", async () => {
      // Wait for cooldown and lock again
      await new Promise(resolve => setTimeout(resolve, 3700 * 1000)); // Wait for cooldown

      const reason = "Test lock for unlock";
      const lockType = { userInitiated: {} };
      const testCode = "test123456";

      await program.methods
        .emergencyLockImproved(reason, lockType, testCode)
        .accounts({
          authority: owner.publicKey,
          estate,
          emergencyState,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([owner])
        .rpc();

      // Wait minimum unlock delay
      await new Promise(resolve => setTimeout(resolve, 310 * 1000)); // 5+ minutes

      // Unlock with correct code
      await program.methods
        .emergencyUnlockImproved(testCode)
        .accounts({
          authority: owner.publicKey,
          estate,
          emergencyState,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([owner])
        .rpc();

      const estateAccount = await program.account.estate.fetch(estate);
      assert.isFalse(estateAccount.isLocked, "Estate should be unlocked");

      const emergencyStateAccount = await program.account.emergencyLockState.fetch(emergencyState);
      assert.isNotNull(emergencyStateAccount.unlockTimestamp);
    });

    it("Should fail unlock with incorrect verification code", async () => {
      // Lock again
      const reason = "Test incorrect code";
      const lockType = { userInitiated: {} };
      const correctCode = "correct123";

      await program.methods
        .emergencyLockImproved(reason, lockType, correctCode)
        .accounts({
          authority: owner.publicKey,
          estate,
          emergencyState,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([owner])
        .rpc();

      // Wait minimum unlock delay
      await new Promise(resolve => setTimeout(resolve, 310 * 1000));

      // Try with wrong code
      try {
        await program.methods
          .emergencyUnlockImproved("wrongcode")
          .accounts({
            authority: owner.publicKey,
            estate,
            emergencyState,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.include(err.toString(), "InvalidVerificationCode");
      }

      const emergencyStateAccount = await program.account.emergencyLockState.fetch(emergencyState);
      assert.equal(emergencyStateAccount.failedUnlockAttempts, 1);
    });

    it("Should pause trading when estate is locked", async () => {
      // Enable trading first
      const aiAgent = Keypair.generate().publicKey;
      const strategy = { conservative: {} };
      
      await program.methods
        .enableTrading(
          aiAgent,
          70, // human share
          strategy,
          10, // stop loss
          24 // emergency delay hours
        )
        .accounts({
          owner: owner.publicKey,
          estate,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      let estateAccount = await program.account.estate.fetch(estate);
      assert.isTrue(estateAccount.tradingEnabled, "Trading should be enabled");

      // Lock estate
      const reason = "Security breach detected";
      const lockType = { securityBreach: {} };

      await program.methods
        .emergencyLockImproved(reason, lockType, "securitycode")
        .accounts({
          authority: owner.publicKey,
          estate,
          emergencyState,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([owner])
        .rpc();

      estateAccount = await program.account.estate.fetch(estate);
      assert.isFalse(estateAccount.tradingEnabled, "Trading should be paused");
      assert.isTrue(estateAccount.isLocked, "Estate should be locked");
    });
  });

  describe("Multisig Emergency Unlock", () => {
    it("Should create emergency unlock proposal", async () => {
      const multisigAccount = await program.account.multisig.fetch(multisig);
      const proposalId = multisigAccount.proposalCount;
      
      [proposal] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("proposal"),
          multisig.toBuffer(),
          proposalId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );

      const action = {
        emergencyUnlock: {
          reason: "Multisig approved emergency unlock"
        }
      };

      await program.methods
        .createProposal(estate, action)
        .accounts({
          proposer: signers[0].publicKey,
          multisig,
          proposal,
          systemProgram: SystemProgram.programId,
        })
        .signers([signers[0]])
        .rpc();

      const proposalAccount = await program.account.proposal.fetch(proposal);
      assert.equal(proposalAccount.proposer.toBase58(), signers[0].publicKey.toBase58());
      assert.deepEqual(proposalAccount.action, action);
    });

    it("Should approve proposal with threshold", async () => {
      // First signer already approved when creating
      // Second signer approves
      await program.methods
        .approveProposal()
        .accounts({
          signer: signers[1].publicKey,
          multisig,
          proposal,
        })
        .signers([signers[1]])
        .rpc();

      const proposalAccount = await program.account.proposal.fetch(proposal);
      assert.equal(proposalAccount.approvals.length, 2);
    });

    it("Should execute multisig emergency unlock", async () => {
      // Execute the proposal
      await program.methods
        .executeProposal()
        .accounts({
          executor: signers[0].publicKey,
          multisig,
          proposal,
        })
        .signers([signers[0]])
        .rpc();

      // Force unlock using executed proposal
      await program.methods
        .forceUnlockByMultisig()
        .accounts({
          executor: signers[0].publicKey,
          estate,
          emergencyState,
          multisig,
          proposal,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([signers[0]])
        .rpc();

      const estateAccount = await program.account.estate.fetch(estate);
      assert.isFalse(estateAccount.isLocked, "Estate should be unlocked by multisig");
    });
  });

  describe("Lock Type Validation", () => {
    it("Should handle different lock types correctly", async () => {
      const lockTypes = [
        { securityBreach: {} },
        { suspiciousActivity: {} },
        { userInitiated: {} },
        { recovery: {} }
      ];

      for (const lockType of lockTypes.slice(0, 3)) { // Skip recovery type
        // Wait for cooldown
        await new Promise(resolve => setTimeout(resolve, 3700 * 1000));

        const reason = `Testing lock type: ${JSON.stringify(lockType)}`;
        
        await program.methods
          .emergencyLockImproved(reason, lockType, `code_${Date.now()}`)
          .accounts({
            authority: owner.publicKey,
            estate,
            emergencyState,
            systemProgram: SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();

        const emergencyStateAccount = await program.account.emergencyLockState.fetch(emergencyState);
        assert.deepEqual(emergencyStateAccount.lockType, lockType);

        // Unlock for next test
        await new Promise(resolve => setTimeout(resolve, 310 * 1000));
        await program.methods
          .emergencyUnlockImproved(`code_${Date.now()}`)
          .accounts({
            authority: owner.publicKey,
            estate,
            emergencyState,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();
      }
    });
  });

  describe("Security Features", () => {
    it("Should track lock count", async () => {
      const initialState = await program.account.emergencyLockState.fetch(emergencyState);
      const initialCount = initialState.lockCount.toNumber();

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 3700 * 1000));

      await program.methods
        .emergencyLockImproved(
          "Tracking lock count",
          { userInitiated: {} },
          "counttest"
        )
        .accounts({
          authority: owner.publicKey,
          estate,
          emergencyState,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([owner])
        .rpc();

      const newState = await program.account.emergencyLockState.fetch(emergencyState);
      assert.equal(newState.lockCount.toNumber(), initialCount + 1);
    });

    it("Should limit failed unlock attempts", async () => {
      // Try multiple wrong codes
      for (let i = 0; i < 4; i++) {
        try {
          await program.methods
            .emergencyUnlockImproved("wrongcode")
            .accounts({
              authority: owner.publicKey,
              estate,
              emergencyState,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            })
            .signers([owner])
            .rpc();
        } catch (err) {
          // Expected to fail
        }
      }

      // Should fail on 5th attempt
      try {
        await program.methods
          .emergencyUnlockImproved("wrongcode")
          .accounts({
            authority: owner.publicKey,
            estate,
            emergencyState,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have exceeded max attempts");
      } catch (err) {
        assert.include(err.toString(), "MaxUnlockAttemptsExceeded");
      }
    });
  });
});