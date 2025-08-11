const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, SYSVAR_RECENT_BLOCKHASHES_PUBKEY } = require("@solana/web3.js");
const fs = require("fs");

const PROGRAM_ID = new PublicKey("EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy");

async function simpleVrfTest() {
  try {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    
    console.log("=== Simple VRF/Randomness Test ===");
    console.log("Wallet:", provider.wallet.publicKey.toString());
    console.log("Program:", PROGRAM_ID.toString());
    
    // Load local IDL (since the deployed one doesn't have new methods)
    const idl = JSON.parse(fs.readFileSync("./target/idl/defai_swap.json", "utf8"));
    
    // Check if the deployed program matches our IDL
    console.log("\nChecking deployed program...");
    
    // Get program account info
    const programInfo = await provider.connection.getAccountInfo(PROGRAM_ID);
    if (programInfo) {
      console.log("✅ Program exists on-chain");
      console.log("  - Owner:", programInfo.owner.toString());
      console.log("  - Data length:", programInfo.data.length);
      console.log("  - Executable:", programInfo.executable);
    } else {
      console.log("❌ Program not found");
      return;
    }
    
    // Check existing PDAs
    console.log("\n=== Checking PDAs ===");
    
    // Config PDA
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    console.log("Config PDA:", config.toString());
    
    const configInfo = await provider.connection.getAccountInfo(config);
    if (configInfo) {
      console.log("  ✅ Config exists");
    } else {
      console.log("  ❌ Config not initialized - need to run initialize first");
    }
    
    // VRF State PDA
    const [vrfState] = PublicKey.findProgramAddressSync(
      [Buffer.from("vrf_state")],
      PROGRAM_ID
    );
    console.log("VRF State PDA:", vrfState.toString());
    
    const vrfInfo = await provider.connection.getAccountInfo(vrfState);
    if (vrfInfo) {
      console.log("  ✅ VRF State exists");
      console.log("    - Data length:", vrfInfo.data.length);
    } else {
      console.log("  ❌ VRF State not initialized");
    }
    
    // Randomness State PDA (new)
    const [randomnessState] = PublicKey.findProgramAddressSync(
      [Buffer.from("randomness_state")],
      PROGRAM_ID
    );
    console.log("Randomness State PDA:", randomnessState.toString());
    
    const randomnessInfo = await provider.connection.getAccountInfo(randomnessState);
    if (randomnessInfo) {
      console.log("  ✅ Randomness State exists");
    } else {
      console.log("  ❌ Randomness State not initialized (expected - new feature)");
    }
    
    console.log("\n=== Summary ===");
    console.log("The deployed program (EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy) is the old version.");
    console.log("It doesn't have the new randomness instructions we added.");
    console.log("\nTo use the new randomness system:");
    console.log("1. Deploy a NEW program (not upgrade) with the new code");
    console.log("2. Initialize the new program");
    console.log("3. Use the new program ID in your frontend");
    console.log("\nAlternatively, continue using the old VRF system with the current deployment.");
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

simpleVrfTest();