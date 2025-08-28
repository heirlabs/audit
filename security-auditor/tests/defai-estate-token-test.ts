import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import { 
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("defai-estate token compatibility", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the program from deployed address
  const programId = new anchor.web3.PublicKey("HvyyPrXbrhNEiGhttDUGMsYjKDPkYER2uFaLo7Bkei92");
  const idl = JSON.parse(require('fs').readFileSync('./target/idl/defai_estate.json', 'utf8'));
  const program = new Program(idl, programId, provider);
  const wallet = provider.wallet;

  // Test accounts
  let estate: anchor.web3.Keypair;
  let globalCounter: anchor.web3.PublicKey;
  let estateMint: anchor.web3.Keypair;
  
  // SPL Token mint
  let splTokenMint: anchor.web3.PublicKey;
  let splTokenUserAccount: anchor.web3.PublicKey;
  let splTokenEstateVault: anchor.web3.PublicKey;
  
  // Token-2022 mint
  let token2022Mint: anchor.web3.PublicKey;
  let token2022UserAccount: anchor.web3.PublicKey;
  let token2022EstateVault: anchor.web3.PublicKey;

  before(async () => {
    // Initialize global counter
    const [counterPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      program.programId
    );
    globalCounter = counterPDA;

    try {
      await program.methods
        .initializeGlobalCounter()
        .accounts({
          admin: wallet.publicKey,
          globalCounter,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      console.log("Global counter already initialized");
    }

    // Create SPL Token mint
    splTokenMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("✅ Created SPL Token mint:", splTokenMint.toBase58());

    // Create Token-2022 mint
    token2022Mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("✅ Created Token-2022 mint:", token2022Mint.toBase58());

    // Create user token accounts
    splTokenUserAccount = await createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      splTokenMint,
      wallet.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    token2022UserAccount = await createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      token2022Mint,
      wallet.publicKey,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Mint some tokens to user accounts
    await mintTo(
      provider.connection,
      wallet.payer,
      splTokenMint,
      splTokenUserAccount,
      wallet.publicKey,
      1000000000000, // 1000 tokens with 9 decimals
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      provider.connection,
      wallet.payer,
      token2022Mint,
      token2022UserAccount,
      wallet.publicKey,
      1000000000000, // 1000 tokens with 9 decimals
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("✅ Minted tokens to user accounts");
  });

  describe("Estate creation and token vault initialization", () => {
    it("Creates an estate", async () => {
      estateMint = anchor.web3.Keypair.generate();
      
      // Get global counter value
      const counterAccount = await program.account.globalCounter.fetch(globalCounter);
      const estateNumber = counterAccount.count.toNumber();
      
      // Derive estate PDA
      const [estatePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("estate"),
          wallet.publicKey.toBuffer(),
          Buffer.from(estateNumber.toString()),
        ],
        program.programId
      );
      
      estate = { publicKey: estatePDA } as anchor.web3.Keypair;

      const inactivityPeriod = new BN(30 * 24 * 60 * 60); // 30 days
      const gracePeriod = new BN(7 * 24 * 60 * 60); // 7 days
      const ownerEmailHash = Buffer.alloc(32).fill(1);

      const tx = await program.methods
        .createEstate(inactivityPeriod, gracePeriod, ownerEmailHash)
        .accounts({
          owner: wallet.publicKey,
          estate: estatePDA,
          globalCounter,
          estateMint: estateMint.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Created estate:", estatePDA.toBase58());
      console.log("   Transaction:", tx);

      // Verify estate was created
      const estateAccount = await program.account.estate.fetch(estatePDA);
      expect(estateAccount.owner.toBase58()).to.equal(wallet.publicKey.toBase58());
      expect(estateAccount.tradingEnabled).to.be.false;
    });

    it("Initializes SPL Token vault for estate", async () => {
      // Derive vault PDA
      const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("estate_vault"),
          estate.publicKey.toBuffer(),
          splTokenMint.toBuffer(),
        ],
        program.programId
      );
      splTokenEstateVault = vaultPDA;

      const tx = await program.methods
        .initEstateVault()
        .accounts({
          owner: wallet.publicKey,
          estate: estate.publicKey,
          estateVault: vaultPDA,
          tokenMint: splTokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Initialized SPL Token vault:", vaultPDA.toBase58());
      console.log("   Transaction:", tx);

      // Verify vault was created
      const vaultAccount = await getAccount(
        provider.connection,
        vaultPDA,
        undefined,
        TOKEN_PROGRAM_ID
      );
      expect(vaultAccount.mint.toBase58()).to.equal(splTokenMint.toBase58());
      expect(vaultAccount.owner.toBase58()).to.equal(estate.publicKey.toBase58());
    });

    it("Initializes Token-2022 vault for estate", async () => {
      // Derive vault PDA
      const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("estate_vault"),
          estate.publicKey.toBuffer(),
          token2022Mint.toBuffer(),
        ],
        program.programId
      );
      token2022EstateVault = vaultPDA;

      const tx = await program.methods
        .initEstateVault()
        .accounts({
          owner: wallet.publicKey,
          estate: estate.publicKey,
          estateVault: vaultPDA,
          tokenMint: token2022Mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Initialized Token-2022 vault:", vaultPDA.toBase58());
      console.log("   Transaction:", tx);

      // Verify vault was created
      const vaultAccount = await getAccount(
        provider.connection,
        vaultPDA,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      expect(vaultAccount.mint.toBase58()).to.equal(token2022Mint.toBase58());
      expect(vaultAccount.owner.toBase58()).to.equal(estate.publicKey.toBase58());
    });
  });

  describe("Token deposits", () => {
    it("Deposits SPL tokens to estate", async () => {
      const depositAmount = new BN(100000000000); // 100 tokens

      // Get initial balance
      const initialVault = await getAccount(
        provider.connection,
        splTokenEstateVault,
        undefined,
        TOKEN_PROGRAM_ID
      );
      const initialBalance = initialVault.amount;

      const tx = await program.methods
        .depositTokenToEstate(depositAmount)
        .accounts({
          depositor: wallet.publicKey,
          estate: estate.publicKey,
          depositorTokenAccount: splTokenUserAccount,
          estateVault: splTokenEstateVault,
          tokenMint: splTokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Deposited SPL tokens to estate");
      console.log("   Amount:", depositAmount.toString());
      console.log("   Transaction:", tx);

      // Verify deposit
      const finalVault = await getAccount(
        provider.connection,
        splTokenEstateVault,
        undefined,
        TOKEN_PROGRAM_ID
      );
      expect(finalVault.amount - initialBalance).to.equal(BigInt(depositAmount.toString()));
    });

    it("Deposits Token-2022 tokens to estate", async () => {
      const depositAmount = new BN(50000000000); // 50 tokens

      // Get initial balance
      const initialVault = await getAccount(
        provider.connection,
        token2022EstateVault,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const initialBalance = initialVault.amount;

      const tx = await program.methods
        .depositTokenToEstate(depositAmount)
        .accounts({
          depositor: wallet.publicKey,
          estate: estate.publicKey,
          depositorTokenAccount: token2022UserAccount,
          estateVault: token2022EstateVault,
          tokenMint: token2022Mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Deposited Token-2022 tokens to estate");
      console.log("   Amount:", depositAmount.toString());
      console.log("   Transaction:", tx);

      // Verify deposit
      const finalVault = await getAccount(
        provider.connection,
        token2022EstateVault,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      expect(finalVault.amount - initialBalance).to.equal(BigInt(depositAmount.toString()));
    });
  });

  describe("Trading functionality with different token types", () => {
    let aiAgent: anchor.web3.Keypair;

    before(() => {
      aiAgent = anchor.web3.Keypair.generate();
    });

    it("Enables trading on the estate", async () => {
      const humanShare = 60; // 60% for human
      const emergencyDelayHours = 48; // 48 hours

      const tx = await program.methods
        .enableTrading(
          aiAgent.publicKey,
          humanShare,
          { balanced: {} }, // TradingStrategy enum
          50, // stop loss at 50%
          emergencyDelayHours
        )
        .accounts({
          owner: wallet.publicKey,
          estate: estate.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Enabled trading on estate");
      console.log("   AI Agent:", aiAgent.publicKey.toBase58());
      console.log("   Transaction:", tx);

      // Verify trading was enabled
      const estateAccount = await program.account.estate.fetch(estate.publicKey);
      expect(estateAccount.tradingEnabled).to.be.true;
      expect(estateAccount.humanShare).to.equal(humanShare);
      expect(estateAccount.aiShare).to.equal(40); // 100 - 60 = 40
    });

    it("Contributes SPL tokens to trading", async () => {
      const contributeAmount = new BN(10000000000); // 10 tokens

      const tx = await program.methods
        .contributeToTrading(contributeAmount)
        .accounts({
          contributor: wallet.publicKey,
          estate: estate.publicKey,
          contributorTokenAccount: splTokenUserAccount,
          estateVault: splTokenEstateVault,
          tokenMint: splTokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Contributed SPL tokens to trading");
      console.log("   Amount:", contributeAmount.toString());
      console.log("   Transaction:", tx);

      // Verify contribution
      const estateAccount = await program.account.estate.fetch(estate.publicKey);
      expect(estateAccount.humanContribution.toNumber()).to.be.greaterThan(0);
    });

    it("Contributes Token-2022 tokens to trading", async () => {
      const contributeAmount = new BN(5000000000); // 5 tokens

      // Create a new Token-2022 vault for trading if needed
      const [tradingVaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("estate_vault"),
          estate.publicKey.toBuffer(),
          token2022Mint.toBuffer(),
        ],
        program.programId
      );

      const tx = await program.methods
        .contributeToTrading(contributeAmount)
        .accounts({
          contributor: wallet.publicKey,
          estate: estate.publicKey,
          contributorTokenAccount: token2022UserAccount,
          estateVault: tradingVaultPDA,
          tokenMint: token2022Mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Contributed Token-2022 tokens to trading");
      console.log("   Amount:", contributeAmount.toString());
      console.log("   Transaction:", tx);

      // Verify contribution was recorded
      const estateAccount = await program.account.estate.fetch(estate.publicKey);
      console.log("   Total human contribution:", estateAccount.humanContribution.toString());
      console.log("   Total trading value:", estateAccount.tradingValue.toString());
    });
  });

  describe("Summary", () => {
    it("Verifies both token types work correctly", async () => {
      // Check SPL Token vault
      const splVault = await getAccount(
        provider.connection,
        splTokenEstateVault,
        undefined,
        TOKEN_PROGRAM_ID
      );
      console.log("\n📊 SPL Token Vault Balance:", splVault.amount.toString());
      expect(splVault.amount).to.be.greaterThan(BigInt(0));

      // Check Token-2022 vault
      const token2022Vault = await getAccount(
        provider.connection,
        token2022EstateVault,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      console.log("📊 Token-2022 Vault Balance:", token2022Vault.amount.toString());
      expect(token2022Vault.amount).to.be.greaterThan(BigInt(0));

      // Check estate state
      const estateAccount = await program.account.estate.fetch(estate.publicKey);
      console.log("\n✅ Estate successfully manages both token types:");
      console.log("   - SPL Token Program ID:", TOKEN_PROGRAM_ID.toBase58());
      console.log("   - Token-2022 Program ID:", TOKEN_2022_PROGRAM_ID.toBase58());
      console.log("   - Trading enabled:", estateAccount.tradingEnabled);
      console.log("   - Human contribution:", estateAccount.humanContribution.toString());
      console.log("   - Trading value:", estateAccount.tradingValue.toString());
    });
  });
});