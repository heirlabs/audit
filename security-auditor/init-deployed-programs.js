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
    
    // Load IDLs
    const swapIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "src/idl/defai_swap.json"), "utf8"));
    const stakingIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "src/idl/defai_staking.json"), "utf8"));
    const estateIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "src/idl/defai_estate.json"), "utf8"));
    const factoryIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "src/idl/defai_app_factory.json"), "utf8"));
    
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
      
      // Create dummy mints for now (you'll need to replace with actual token mints)
      const oldMint = Keypair.generate().publicKey;
      const newMint = Keypair.generate().publicKey;
      const collection = Keypair.generate().publicKey;
      const treasury = wallet.publicKey;
      
      const tx = await swapProgram.methods
        .initialize(
          oldMint,
          newMint,
          collection,
          treasury,
          [1000000, 2000000, 3000000, 4000000, 5000000] // tier prices
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
    } catch (error) {
      if (error.toString().includes("already in use")) {
        console.log("⚠️  DEFAI Swap already initialized");
      } else {
        console.error("❌ Error initializing DEFAI Swap:", error.toString());
      }
    }
    
    // 2. Initialize DEFAI Staking
    console.log("\n2. Initializing DEFAI Staking...");
    try {
      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        stakingProgram.programId
      );
      
      // Dummy token mint for now
      const tokenMint = Keypair.generate().publicKey;
      
      const tx = await stakingProgram.methods
        .initialize(tokenMint)
        .accounts({
          admin: wallet.publicKey,
          config,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ DEFAI Staking initialized. Tx:", tx);
    } catch (error) {
      if (error.toString().includes("already in use")) {
        console.log("⚠️  DEFAI Staking already initialized");
      } else {
        console.error("❌ Error initializing DEFAI Staking:", error.toString());
      }
    }
    
    // 3. Initialize DEFAI Estate
    console.log("\n3. Initializing DEFAI Estate...");
    try {
      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        estateProgram.programId
      );
      
      const tx = await estateProgram.methods
        .initialize()
        .accounts({
          admin: wallet.publicKey,
          config,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ DEFAI Estate initialized. Tx:", tx);
    } catch (error) {
      if (error.toString().includes("already in use")) {
        console.log("⚠️  DEFAI Estate already initialized");
      } else {
        console.error("❌ Error initializing DEFAI Estate:", error.toString());
      }
    }
    
    // 4. Initialize DEFAI App Factory
    console.log("\n4. Initializing DEFAI App Factory...");
    try {
      const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        factoryProgram.programId
      );
      
      // Dummy collection mint
      const collectionMint = Keypair.generate().publicKey;
      
      const tx = await factoryProgram.methods
        .initialize(collectionMint)
        .accounts({
          admin: wallet.publicKey,
          config,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ DEFAI App Factory initialized. Tx:", tx);
    } catch (error) {
      if (error.toString().includes("already in use")) {
        console.log("⚠️  DEFAI App Factory already initialized");
      } else {
        console.error("❌ Error initializing DEFAI App Factory:", error.toString());
      }
    }
    
    console.log("\n=== Initialization Complete ===");
    console.log("\nProgram IDs:");
    Object.entries(PROGRAM_IDS).forEach(([name, id]) => {
      console.log(`  ${name}: ${id}`);
    });
    
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run initialization
initializePrograms().then(() => {
  console.log("\n✅ All done!");
}).catch(console.error);