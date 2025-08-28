const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");

// Program ID from deployment
const PROGRAM_ID = new PublicKey("6cx8dDdqr9zaRNH84vH3nLantbGPLB4ZqdJm5V5tHpAi");

async function main() {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const wallet = provider.wallet;
  const connection = provider.connection;
  
  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/defai_estate.json", "utf8"));
  const program = new anchor.Program(idl, PROGRAM_ID, provider);
  
  console.log("🔧 Testing DeFAI Estate Token Compatibility");
  console.log("============================================\n");
  
  // Step 1: Initialize global counter if needed
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
  
  // Step 2: Create estate
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
  
  console.log("Creating estate #" + estateNumber + "...");
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
  
  // Step 3: Test with SPL Token
  console.log("\n📝 Testing SPL Token Integration");
  console.log("--------------------------------");
  
  const splMint = await createMint(
    connection,
    wallet.payer,
    wallet.publicKey,
    wallet.publicKey,
    9,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ Created SPL mint:", splMint.toBase58());
  
  // Create user account
  const splUserAccount = await createAssociatedTokenAccount(
    connection,
    wallet.payer,
    splMint,
    wallet.publicKey,
    undefined,
    TOKEN_PROGRAM_ID
  );
  
  // Mint tokens
  await mintTo(
    connection,
    wallet.payer,
    splMint,
    splUserAccount,
    wallet.publicKey,
    1000_000_000_000,
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ Minted 1000 SPL tokens to user");
  
  // Initialize estate vault for SPL token
  const [splVaultPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("estate_vault"),
      estatePDA.toBuffer(),
      splMint.toBuffer(),
    ],
    PROGRAM_ID
  );
  
  await program.methods
    .initEstateVault()
    .accounts({
      owner: wallet.publicKey,
      estate: estatePDA,
      estateVault: splVaultPDA,
      tokenMint: splMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("✅ Initialized SPL vault:", splVaultPDA.toBase58());
  
  // Deposit SPL tokens
  await program.methods
    .depositTokenToEstate(new anchor.BN(100_000_000_000))
    .accounts({
      depositor: wallet.publicKey,
      estate: estatePDA,
      depositorTokenAccount: splUserAccount,
      estateVault: splVaultPDA,
      tokenMint: splMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  
  const splVaultAccount = await getAccount(connection, splVaultPDA, undefined, TOKEN_PROGRAM_ID);
  console.log("✅ Deposited 100 SPL tokens. Vault balance:", splVaultAccount.amount.toString());
  
  // Step 4: Test with Token-2022
  console.log("\n📝 Testing Token-2022 Integration");
  console.log("---------------------------------");
  
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
  
  // Create user account
  const token2022UserAccount = await createAssociatedTokenAccount(
    connection,
    wallet.payer,
    token2022Mint,
    wallet.publicKey,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Mint tokens
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
  console.log("✅ Minted 1000 Token-2022 tokens to user");
  
  // Initialize estate vault for Token-2022
  const [token2022VaultPDA] = PublicKey.findProgramAddressSync(
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
      estateVault: token2022VaultPDA,
      tokenMint: token2022Mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("✅ Initialized Token-2022 vault:", token2022VaultPDA.toBase58());
  
  // Deposit Token-2022 tokens
  await program.methods
    .depositTokenToEstate(new anchor.BN(50_000_000_000))
    .accounts({
      depositor: wallet.publicKey,
      estate: estatePDA,
      depositorTokenAccount: token2022UserAccount,
      estateVault: token2022VaultPDA,
      tokenMint: token2022Mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  
  const token2022VaultAccount = await getAccount(connection, token2022VaultPDA, undefined, TOKEN_2022_PROGRAM_ID);
  console.log("✅ Deposited 50 Token-2022 tokens. Vault balance:", token2022VaultAccount.amount.toString());
  
  // Step 5: Summary
  console.log("\n✨ Test Results Summary");
  console.log("=======================");
  console.log("✅ Estate created successfully");
  console.log("✅ SPL Token vault initialized and funded");
  console.log("✅ Token-2022 vault initialized and funded");
  console.log("✅ Both token standards work with the same program!");
  console.log("\n🎉 The defai_estate program is fully compatible with both SPL and Token-2022!");
  
  // Fetch final estate state
  const estateAccount = await program.account.estate.fetch(estatePDA);
  console.log("\n📊 Estate Details:");
  console.log("   Owner:", estateAccount.owner.toBase58());
  console.log("   Estate Number:", estateAccount.estateNumber.toString());
  console.log("   SPL Vault Balance:", splVaultAccount.amount.toString());
  console.log("   Token-2022 Vault Balance:", token2022VaultAccount.amount.toString());
}

main()
  .then(() => {
    console.log("\n✅ All tests completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  });