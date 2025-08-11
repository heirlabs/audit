const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy");

async function testVrfInit() {
  try {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    
    console.log("Wallet:", provider.wallet.publicKey.toString());
    console.log("Network:", provider.connection.rpcEndpoint);
    
    // Try to fetch IDL from chain
    const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
    if (!idl) {
      console.log("No IDL found on chain, using local IDL");
      const fs = require("fs");
      const idlFile = JSON.parse(fs.readFileSync("./target/idl/defai_swap.json", "utf8"));
      const program = new anchor.Program(idlFile, PROGRAM_ID, provider);
      
      // Check what instructions are available
      console.log("\nAvailable instructions:");
      Object.keys(program.methods).forEach(method => {
        console.log(`  - ${method}`);
      });
      
      // Try to check VRF state
      const [vrfState] = PublicKey.findProgramAddressSync(
        [Buffer.from("vrf_state")],
        program.programId
      );
      
      console.log("\nVRF State PDA:", vrfState.toString());
      
      try {
        const state = await program.account.vrfState.fetch(vrfState);
        console.log("VRF State exists:");
        console.log("  - VRF Account:", state.vrfAccount.toString());
        console.log("  - Last Timestamp:", state.lastTimestamp);
        console.log("  - Has result:", state.resultBuffer.some(b => b !== 0));
      } catch (e) {
        console.log("VRF State not initialized yet");
        
        // Try to initialize
        console.log("\nAttempting to initialize VRF state...");
        
        // Use a dummy VRF account for now
        const dummyVrfAccount = PublicKey.default;
        
        try {
          const tx = await program.methods
            .initializeVrfState(dummyVrfAccount)
            .accounts({
              authority: provider.wallet.publicKey,
              vrfState,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          
          console.log("✅ VRF State initialized! Tx:", tx);
        } catch (initError) {
          console.log("❌ Failed to initialize:", initError.message);
        }
      }
      
    } else {
      console.log("IDL found on chain");
      const program = new anchor.Program(idl, PROGRAM_ID, provider);
      console.log("Program loaded successfully");
    }
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testVrfInit();