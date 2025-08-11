import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Randomness } from "@switchboard-xyz/solana.js";

// Your deployed program ID
const DEFAI_SWAP_PROGRAM_ID = new PublicKey("EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy");

// Switchboard Queue for Devnet
const SWITCHBOARD_QUEUE_DEVNET = new PublicKey("FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di");

export async function initializeRandomness() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const wallet = provider.wallet;
  console.log("Wallet:", wallet.publicKey.toString());
  console.log("Network:", provider.connection.rpcEndpoint);
  
  // Load the program
  const idl = JSON.parse(
    require("fs").readFileSync("./target/idl/defai_swap.json", "utf8")
  );
  const program = new anchor.Program(idl, DEFAI_SWAP_PROGRAM_ID, provider);
  
  // Derive the randomness state PDA
  const [randomnessState] = PublicKey.findProgramAddressSync(
    [Buffer.from("randomness_state")],
    program.programId
  );
  
  console.log("Randomness State PDA:", randomnessState.toString());
  
  try {
    // 1. Initialize the randomness state
    console.log("\n1. Initializing randomness state...");
    const initTx = await program.methods
      .initializeRandomnessV2()
      .accounts({
        authority: wallet.publicKey,
        randomnessState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("✅ Randomness state initialized. Tx:", initTx);
    
    // 2. Create a Switchboard randomness account (for production)
    console.log("\n2. Creating Switchboard randomness account...");
    const randomnessKeypair = Keypair.generate();
    
    try {
      const randomness = await Randomness.create(provider.connection, {
        queue: SWITCHBOARD_QUEUE_DEVNET,
        keypair: randomnessKeypair,
        authority: wallet.publicKey,
      });
      
      console.log("✅ Switchboard randomness account created:", randomness.pubkey.toString());
      
      // 3. Commit to randomness
      console.log("\n3. Committing to randomness...");
      const commitTx = await program.methods
        .commitRandomnessV2()
        .accounts({
          authority: wallet.publicKey,
          randomnessState,
          randomnessAccount: randomness.pubkey,
        })
        .rpc();
      
      console.log("✅ Randomness committed. Tx:", commitTx);
      
      // 4. Request randomness from Switchboard
      console.log("\n4. Requesting randomness from Switchboard...");
      const requestTx = await randomness.requestRandomness({
        authority: wallet.publicKey,
      });
      
      console.log("✅ Randomness requested. Tx:", requestTx.signature);
      
      // 5. Wait and reveal (in production, this would be done after confirmation)
      console.log("\n5. Waiting for randomness to be available...");
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const revealTx = await program.methods
        .revealRandomnessV2()
        .accounts({
          authority: wallet.publicKey,
          randomnessState,
          randomnessAccount: randomness.pubkey,
        })
        .rpc();
      
      console.log("✅ Randomness revealed. Tx:", revealTx);
      
      // Read the revealed value
      const state = await program.account.randomnessState.fetch(randomnessState);
      console.log("\n📊 Randomness State:");
      console.log("  - Authority:", state.authority.toString());
      console.log("  - Randomness Account:", state.randomnessAccount.toString());
      console.log("  - Revealed Value:", Buffer.from(state.revealedValue).toString("hex"));
      console.log("  - Last Update:", new Date(state.lastUpdate * 1000).toISOString());
      
    } catch (switchboardError) {
      console.log("⚠️  Switchboard randomness failed (expected on devnet):", switchboardError.message);
      console.log("\n🔄 Falling back to simple on-chain randomness...");
      
      // Fallback: Use simple on-chain randomness
      const simpleTx = await program.methods
        .generateSimpleRandomness()
        .accounts({
          authority: wallet.publicKey,
          randomnessState,
          recentBlockhashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        })
        .rpc();
      
      console.log("✅ Simple randomness generated. Tx:", simpleTx);
      
      // Read the generated value
      const state = await program.account.randomnessState.fetch(randomnessState);
      console.log("\n📊 Simple Randomness State:");
      console.log("  - Revealed Value:", Buffer.from(state.revealedValue).toString("hex"));
      console.log("  - Last Update:", new Date(state.lastUpdate * 1000).toISOString());
    }
    
    return {
      randomnessState,
      success: true,
    };
    
  } catch (error) {
    console.error("❌ Error:", error);
    
    // Check if already initialized
    if (error.toString().includes("already in use")) {
      console.log("ℹ️  Randomness already initialized. Reading current state...");
      
      try {
        const state = await program.account.randomnessState.fetch(randomnessState);
        console.log("\n📊 Existing Randomness State:");
        console.log("  - Authority:", state.authority.toString());
        console.log("  - Last Update:", new Date(state.lastUpdate * 1000).toISOString());
        console.log("  - Is Pending:", state.isPending);
        
        return {
          randomnessState,
          success: true,
          alreadyInitialized: true,
        };
      } catch (fetchError) {
        console.error("Failed to fetch state:", fetchError);
      }
    }
    
    throw error;
  }
}

// Helper function to use randomness in a game/swap
export async function useRandomnessForTierSelection(
  program: anchor.Program,
  randomnessState: PublicKey
): Promise<number> {
  const state = await program.account.randomnessState.fetch(randomnessState);
  
  if (state.isPending) {
    throw new Error("Randomness not yet revealed");
  }
  
  // Convert random bytes to a number in range [0, 4] for tier selection
  const randomBytes = state.revealedValue;
  const randomValue = randomBytes[0] % 5; // Simple modulo for 5 tiers
  
  console.log(`Selected tier: ${randomValue}`);
  return randomValue;
}

// Run if called directly
if (require.main === module) {
  initializeRandomness()
    .then((result) => {
      console.log("\n✅ Randomness initialization complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Failed:", error);
      process.exit(1);
    });
}