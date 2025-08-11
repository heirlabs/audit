const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

// Your deployed program IDs
const PROGRAM_IDS = {
  defai_swap: "EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy",
  defai_staking: "3f1FBXvybT9m6ppRkqPyQBQ318KrC2fU3NHVUtnfNJyv",
  defai_estate: "BUUhKqR35SGMgE9KALrYHTsCuNGGQcce8h54sfGGUGm1",
  defai_app_factory: "62javQ376d4hShFrQQfts6kvEBzHKmSWSxPA3xyxxmLM"
};

async function initializePrograms() {
  try {
    // Setup provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    
    const wallet = provider.wallet;
    console.log("Using wallet:", wallet.publicKey.toString());
    console.log("Network:", provider.connection.rpcEndpoint);
    
    // Load IDLs from target directory (these are the compiled ones)
    const swapIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "target/idl/defai_swap.json"), "utf8"));
    const stakingIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "target/idl/defai_staking.json"), "utf8"));
    const estateIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "target/idl/defai_estate.json"), "utf8"));
    const factoryIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "target/idl/defai_app_factory.json"), "utf8"));
    
    // Create program instances
    const swapProgram = new anchor.Program(swapIdl, PROGRAM_IDS.defai_swap, provider);
    const stakingProgram = new anchor.Program(stakingIdl, PROGRAM_IDS.defai_staking, provider);
    const estateProgram = new anchor.Program(estateIdl, PROGRAM_IDS.defai_estate, provider);
    const factoryProgram = new anchor.Program(factoryIdl, PROGRAM_IDS.defai_app_factory, provider);
    
    console.log("\n=== Initializing DEFAI Programs ===\n");
    
    // 1. Initialize DEFAI Swap
    console.log("1. Initializing DEFAI Swap...");
    try {
      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        swapProgram.programId
      );
      
      const [escrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow")],
        swapProgram.programId
      );
      
      const [taxState] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_state")],
        swapProgram.programId
      );
      
      // Create dummy mints for now - you'll replace these with real token addresses
      const oldMint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
      const newMint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL  
      const collection = Keypair.generate().publicKey;
      const treasury = wallet.publicKey;
      
      const tx = await swapProgram.methods
        .initialize(
          oldMint,
          newMint,
          collection,
          treasury,
          [1000000, 2000000, 3000000, 4000000, 5000000] // tier prices in lamports
        )
        .accounts({
          admin: wallet.publicKey,
          config,
          escrow,
          taxState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ DEFAI Swap initialized. Tx:", tx);
      console.log("   Config PDA:", config.toString());
      console.log("   Escrow PDA:", escrow.toString());
    } catch (error) {
      if (error.toString().includes("already in use") || error.toString().includes("already been processed")) {
        console.log("⚠️  DEFAI Swap already initialized");
        const [config] = PublicKey.findProgramAddressSync(
          [Buffer.from("config")],
          swapProgram.programId
        );
        console.log("   Config PDA:", config.toString());
      } else {
        console.error("❌ Error initializing DEFAI Swap:", error.toString().slice(0, 200));
      }
    }
    
    // 2. Initialize DEFAI Staking
    console.log("\n2. Initializing DEFAI Staking...");
    try {
      const [programState] = PublicKey.findProgramAddressSync(
        [Buffer.from("program_state")],
        stakingProgram.programId
      );
      
      const [escrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow")],
        stakingProgram.programId
      );
      
      // Use wrapped SOL as token mint for now
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      const tx = await stakingProgram.methods
        .initializeProgram(tokenMint)
        .accounts({
          admin: wallet.publicKey,
          programState,
          escrow,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ DEFAI Staking initialized. Tx:", tx);
      console.log("   Program State PDA:", programState.toString());
    } catch (error) {
      if (error.toString().includes("already in use") || error.toString().includes("already been processed")) {
        console.log("⚠️  DEFAI Staking already initialized");
        const [programState] = PublicKey.findProgramAddressSync(
          [Buffer.from("program_state")],
          stakingProgram.programId
        );
        console.log("   Program State PDA:", programState.toString());
      } else {
        console.error("❌ Error initializing DEFAI Staking:", error.toString().slice(0, 200));
      }
    }
    
    // 3. Initialize DEFAI Estate
    console.log("\n3. Initializing DEFAI Estate...");
    try {
      const [multisig] = PublicKey.findProgramAddressSync(
        [Buffer.from("multisig")],
        estateProgram.programId
      );
      
      const [globalCounter] = PublicKey.findProgramAddressSync(
        [Buffer.from("global_counter")],
        estateProgram.programId
      );
      
      // First initialize multisig
      try {
        const tx1 = await estateProgram.methods
          .initializeMultisig(
            [wallet.publicKey], // initial owners
            1, // threshold
            180 // grace period in seconds
          )
          .accounts({
            creator: wallet.publicKey,
            multisig,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log("   Multisig initialized. Tx:", tx1);
      } catch (e) {
        if (!e.toString().includes("already in use")) throw e;
      }
      
      // Then initialize global counter
      const tx2 = await estateProgram.methods
        .initializeGlobalCounter()
        .accounts({
          admin: wallet.publicKey,
          globalCounter,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ DEFAI Estate initialized. Tx:", tx2);
      console.log("   Multisig PDA:", multisig.toString());
      console.log("   Global Counter PDA:", globalCounter.toString());
    } catch (error) {
      if (error.toString().includes("already in use") || error.toString().includes("already been processed")) {
        console.log("⚠️  DEFAI Estate already initialized");
        const [multisig] = PublicKey.findProgramAddressSync(
          [Buffer.from("multisig")],
          estateProgram.programId
        );
        console.log("   Multisig PDA:", multisig.toString());
      } else {
        console.error("❌ Error initializing DEFAI Estate:", error.toString().slice(0, 200));
      }
    }
    
    // 4. Initialize DEFAI App Factory
    console.log("\n4. Initializing DEFAI App Factory...");
    try {
      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        factoryProgram.programId
      );
      
      // Dummy collection mint - you'll need to create a real collection
      const collectionMint = Keypair.generate().publicKey;
      const treasury = wallet.publicKey;
      
      const tx = await factoryProgram.methods
        .initializeAppFactory(collectionMint, treasury)
        .accounts({
          admin: wallet.publicKey,
          config,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ DEFAI App Factory initialized. Tx:", tx);
      console.log("   Config PDA:", config.toString());
    } catch (error) {
      if (error.toString().includes("already in use") || error.toString().includes("already been processed")) {
        console.log("⚠️  DEFAI App Factory already initialized");
        const [config] = PublicKey.findProgramAddressSync(
          [Buffer.from("config")],
          factoryProgram.programId
        );
        console.log("   Config PDA:", config.toString());
      } else {
        console.error("❌ Error initializing DEFAI App Factory:", error.toString().slice(0, 200));
      }
    }
    
    console.log("\n=== Initialization Complete ===");
    console.log("\nProgram IDs:");
    Object.entries(PROGRAM_IDS).forEach(([name, id]) => {
      console.log(`  ${name}: ${id}`);
    });
    
    console.log("\n💡 Next steps:");
    console.log("1. Create proper token mints for DEFAI tokens");
    console.log("2. Create NFT collection for the marketplace");
    console.log("3. Initialize VRF state for randomness (if using Switchboard)");
    console.log("4. Set up proper treasury wallets");
    
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run initialization
initializePrograms().then(() => {
  console.log("\n✅ Script completed!");
}).catch(console.error);