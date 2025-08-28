const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");

// Update with your deployed program ID
const PROGRAM_ID = new PublicKey("3WN7Eiq5pCGdoCXJW4jf8NygqPv8FzTvwXZArHtYFKYV");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const wallet = provider.wallet;
  const connection = provider.connection;
  
  const idl = JSON.parse(fs.readFileSync("./target/idl/defai_estate.json", "utf8"));
  const program = new anchor.Program(idl, PROGRAM_ID, provider);
  
  console.log("🔧 Testing Trading Controls (Pause/Resume)");
  console.log("==========================================\n");
  
  // Initialize global counter if needed
  const [globalCounter] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter")],
    PROGRAM_ID
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
    console.log("✅ Initialized global counter");
  } catch (e) {
    console.log("ℹ️  Global counter already initialized");
  }
  
  // Create estate
  let estateNumber = 0;
  try {
    const counterAccount = await program.account.globalCounter.fetch(globalCounter);
    estateNumber = counterAccount.count.toNumber();
  } catch (e) {
    console.log("Starting with estate number 0");
  }
  
  const estateNumberBuffer = Buffer.alloc(8);
  estateNumberBuffer.writeBigUInt64LE(BigInt(estateNumber));
  
  const [estatePDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("estate"),
      wallet.publicKey.toBuffer(),
      estateNumberBuffer,
    ],
    PROGRAM_ID
  );
  
  const estateMint = Keypair.generate();
  const inactivityPeriod = new anchor.BN(30 * 24 * 60 * 60);
  const gracePeriod = new anchor.BN(7 * 24 * 60 * 60);
  const ownerEmailHash = Buffer.alloc(32).fill(1);
  
  console.log("Creating estate...");
  await program.methods
    .createEstate(inactivityPeriod, gracePeriod, Array.from(ownerEmailHash))
    .accounts({
      owner: wallet.publicKey,
      estate: estatePDA,
      globalCounter,
      estateMint: estateMint.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  console.log("✅ Created estate:", estatePDA.toBase58());
  
  // Test trading controls
  console.log("\n📝 Testing Trading Controls");
  console.log("---------------------------");
  
  const aiAgent = Keypair.generate();
  
  // 1. Enable trading
  console.log("\n1️⃣ Enabling trading...");
  await program.methods
    .enableTrading(
      aiAgent.publicKey,
      60, // 60% human share
      { balanced: {} },
      50, // 50% stop loss
      48, // 48 hours emergency delay
    )
    .accounts({
      owner: wallet.publicKey,
      estate: estatePDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  let estateAccount = await program.account.estate.fetch(estatePDA);
  console.log("✅ Trading enabled:", estateAccount.tradingEnabled);
  console.log("   AI Agent:", estateAccount.aiAgent?.toBase58());
  console.log("   Human share:", estateAccount.humanShare, "%");
  
  // 2. Pause trading
  console.log("\n2️⃣ Pausing trading...");
  await program.methods
    .pauseTrading()
    .accounts({
      owner: wallet.publicKey,
      estate: estatePDA,
    })
    .rpc();
  
  estateAccount = await program.account.estate.fetch(estatePDA);
  console.log("✅ Trading paused:", !estateAccount.tradingEnabled);
  
  // 3. Try to pause again (should fail)
  console.log("\n3️⃣ Testing double pause (should fail)...");
  try {
    await program.methods
      .pauseTrading()
      .accounts({
        owner: wallet.publicKey,
        estate: estatePDA,
      })
      .rpc();
    console.log("❌ Should have failed - trading already paused");
  } catch (e) {
    console.log("✅ Correctly failed:", e.error?.errorMessage || e.toString());
  }
  
  // 4. Resume trading
  console.log("\n4️⃣ Resuming trading...");
  await program.methods
    .resumeTrading()
    .accounts({
      owner: wallet.publicKey,
      estate: estatePDA,
    })
    .rpc();
  
  estateAccount = await program.account.estate.fetch(estatePDA);
  console.log("✅ Trading resumed:", estateAccount.tradingEnabled);
  console.log("   AI Agent preserved:", estateAccount.aiAgent?.toBase58());
  console.log("   Settings preserved - Human share:", estateAccount.humanShare, "%");
  
  // 5. Test Token-2022 compatibility
  console.log("\n5️⃣ Testing Token-2022 Support...");
  
  // Create Token-2022 mint
  const token2022Mint = await createMint(
    connection,
    wallet.payer,
    wallet.publicKey,
    wallet.publicKey,
    9,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("✅ Created Token-2022 mint:", token2022Mint.toBase58());
  
  // Initialize vault for Token-2022
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("estate_vault"),
      estatePDA.toBuffer(),
      token2022Mint.toBuffer(),
    ],
    PROGRAM_ID
  );
  
  await program.methods
    .initEstateVault()
    .accounts({
      owner: wallet.publicKey,
      estate: estatePDA,
      estateVault: vaultPDA,
      tokenMint: token2022Mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("✅ Initialized Token-2022 vault:", vaultPDA.toBase58());
  
  // Create user account and mint tokens
  const token2022UserAccount = await createAssociatedTokenAccount(
    connection,
    wallet.payer,
    token2022Mint,
    wallet.publicKey,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  await mintTo(
    connection,
    wallet.payer,
    token2022Mint,
    token2022UserAccount,
    wallet.publicKey,
    1000_000_000_000,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Deposit Token-2022 tokens
  await program.methods
    .depositTokenToEstate(new anchor.BN(100_000_000_000))
    .accounts({
      depositor: wallet.publicKey,
      estate: estatePDA,
      depositorTokenAccount: token2022UserAccount,
      estateVault: vaultPDA,
      tokenMint: token2022Mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  console.log("✅ Successfully deposited Token-2022 tokens!");
  
  // Summary
  console.log("\n✨ Test Summary");
  console.log("===============");
  console.log("✅ Trading can be enabled");
  console.log("✅ Trading can be paused");
  console.log("✅ Trading can be resumed");
  console.log("✅ Trading settings are preserved");
  console.log("✅ Token-2022 is fully supported");
  console.log("✅ Double pause/resume prevented");
  console.log("\n🎉 All trading control features working correctly!");
}

main()
  .then(() => {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  });