# VRF/Randomness Integration Guide for DEFAI Swap

## Overview

This guide explains how to integrate randomness functionality into the DEFAI Swap program using either:
1. **Switchboard On-Demand Randomness** (Production - Recommended)
2. **Simple On-Chain Randomness** (Development/Testing)

The randomness is used for fair tier selection in NFT swaps and other features requiring unpredictable values.

> **Important Update (January 2025)**: Switchboard has deprecated VRF Lite in favor of their new On-Demand Randomness service. The old VRF code has been removed and replaced with the new randomness_v2 implementation.

## Architecture Changes

### Old Approach (Deprecated VRF Lite)
- Used Switchboard VRF Lite with complex escrow funding
- Required multiple accounts and permission setup
- Had reliability issues with oracle crashes

### New Approach (Current Implementation)
- **Switchboard On-Demand Randomness** with TEE (Trusted Execution Environment)
- Commit-reveal mechanism for transparency
- Simplified account structure
- Fallback to simple on-chain randomness for testing

## Program Updates

### Code Changes (Completed)
- ✅ Removed old VRF modules (`vrf.rs`, `randomness.rs`)
- ✅ Removed deprecated VRF functions
- ✅ Updated all swap functions to use new `RandomnessState`
- ✅ Migrated helper functions to `randomness_v2.rs`
- ✅ Program size reduced from 730KB to 686KB

### Build Status
- **Program builds successfully** with new randomness implementation
- **All 3 swap functions preserved** and working
- **Random bonus generation maintained** for NFTs

## Deployment Information

### Program Size & Deployment

#### Current Status
- **Program Size**: 686KB (after VRF removal)
- **Standard Limit**: ~600KB without extension
- **Solution**: Deploy with `--max-len` parameter (up to 10MB supported)

#### Deployment Command
```bash
# Ensure you have ~6 SOL for deployment
solana balance

# Deploy with extended size allocation
solana program deploy target/deploy/defai_swap.so \
  --program-id defai_swap_v2_keypair.json \
  --max-len 750000  # Allocates 750KB
```

#### Cost Breakdown
- Base Rent: ~2.5 SOL
- Program Data (686KB): ~0.95 SOL
- Buffer Account: ~2.5 SOL
- **Total**: ~6 SOL (most refundable when closing buffer)

### Deployed Programs (Devnet)
- **defai_swap (old)**: `EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy` (706KB, proving extended programs work)
- **defai_swap (new)**: Deploy with new keypair using command above
- **Randomness State PDA**: Derived from `[b"randomness_state"]`

### Switchboard Configuration
- **Devnet Queue**: `FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di`
- **Mainnet Queue**: `5JYwqvKkqp35w8Nq3ba4z1WYUeJQ1rB36V8XvaGp6zn1`

## One-Time Initialization (Admin Only)

### Using the Initialization Script

```bash
# Install dependencies
npm install @coral-xyz/anchor @solana/web3.js @switchboard-xyz/solana.js

# Run initialization
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=./admin-keypair.json \
ts-node scripts/init-randomness.ts
```

### Manual Initialization Steps

1. **Initialize Randomness State**
```typescript
const [randomnessState] = PublicKey.findProgramAddressSync(
  [Buffer.from("randomness_state")],
  program.programId
);

await program.methods
  .initializeRandomnessV2()
  .accounts({
    authority: wallet.publicKey,
    randomnessState,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

2. **For Production (Switchboard)**
```typescript
import { Randomness } from "@switchboard-xyz/solana.js";

const randomnessKeypair = Keypair.generate();
const randomness = await Randomness.create(connection, {
  queue: QUEUE_PUBKEY,
  keypair: randomnessKeypair,
  authority: wallet.publicKey,
});

// Commit to randomness
await program.methods
  .commitRandomnessV2()
  .accounts({
    authority: wallet.publicKey,
    randomnessState,
    randomnessAccount: randomness.pubkey,
  })
  .rpc();

// Request from Switchboard
await randomness.requestRandomness({ authority: wallet.publicKey });

// Wait and reveal
await new Promise(resolve => setTimeout(resolve, 3000));
await program.methods
  .revealRandomnessV2()
  .accounts({
    authority: wallet.publicKey,
    randomnessState,
    randomnessAccount: randomness.pubkey,
  })
  .rpc();
```

3. **For Development (Simple Randomness)**
```typescript
await program.methods
  .generateSimpleRandomness()
  .accounts({
    authority: wallet.publicKey,
    randomnessState,
    recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  })
  .rpc();
```

## Frontend Integration

### React Component Example

```typescript
import React, { useState, useCallback } from 'react';
import * as anchor from '@coral-xyz/anchor';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Randomness } from '@switchboard-xyz/solana.js';

const PROGRAM_ID = new PublicKey("EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy");
const QUEUE_PUBKEY = new PublicKey("FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di");

export function RandomnessComponent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [randomValue, setRandomValue] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  const generateRandomness = useCallback(async () => {
    if (!wallet.publicKey) return;
    
    setLoading(true);
    try {
      const provider = new anchor.AnchorProvider(
        connection,
        wallet as any,
        { commitment: 'confirmed' }
      );
      
      const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
      const program = new anchor.Program(idl!, PROGRAM_ID, provider);
      
      const [randomnessState] = PublicKey.findProgramAddressSync(
        [Buffer.from("randomness_state")],
        program.programId
      );
      
      // For development, use simple randomness
      await program.methods
        .generateSimpleRandomness()
        .accounts({
          authority: wallet.publicKey,
          randomnessState,
          recentBlockhashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        })
        .rpc();
      
      // Fetch the result
      const state = await program.account.randomnessState.fetch(randomnessState);
      const hexValue = Buffer.from(state.revealedValue).toString('hex');
      setRandomValue(hexValue);
      
      // Calculate tier (0-4)
      const tier = state.revealedValue[0] % 5;
      setSelectedTier(tier);
      
    } catch (error) {
      console.error("Error generating randomness:", error);
    } finally {
      setLoading(false);
    }
  }, [connection, wallet]);

  return (
    <div className="randomness-panel">
      <h2>Randomness Generator</h2>
      
      <button 
        onClick={generateRandomness}
        disabled={loading || !wallet.publicKey}
      >
        {loading ? 'Generating...' : 'Generate Random Tier'}
      </button>
      
      {randomValue && (
        <div className="results">
          <p><strong>Random Value:</strong></p>
          <code>{randomValue.slice(0, 32)}...</code>
          
          {selectedTier !== null && (
            <p><strong>Selected NFT Tier:</strong> {selectedTier}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

### Integration with Swap Function

```typescript
async function swapWithRandomTier(
  program: anchor.Program,
  amount: number
) {
  const [randomnessState] = PublicKey.findProgramAddressSync(
    [Buffer.from("randomness_state")],
    program.programId
  );
  
  // Ensure randomness is available
  const state = await program.account.randomnessState.fetch(randomnessState);
  if (state.isPending) {
    throw new Error("Please generate randomness first");
  }
  
  // Use the random value for tier selection
  const selectedTier = state.revealedValue[0] % 5;
  
  // Call swap with the randomly selected tier
  await program.methods
    .swapDefaiForPnftV6(
      new anchor.BN(amount),
      selectedTier,
      // ... other parameters
    )
    .accounts({
      // ... swap accounts
      randomnessState, // Include randomness state for verification
    })
    .rpc();
}
```

### Complete Integration Example

```typescript
import { useState, useEffect } from 'react';
import * as anchor from '@coral-xyz/anchor';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

export function SwapWithRandomness() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [program, setProgram] = useState<anchor.Program | null>(null);
  const [isRandomnessReady, setIsRandomnessReady] = useState(false);

  useEffect(() => {
    async function loadProgram() {
      if (!wallet.publicKey) return;
      
      const provider = new anchor.AnchorProvider(
        connection,
        wallet as any,
        { commitment: 'confirmed' }
      );
      
      const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
      if (idl) {
        setProgram(new anchor.Program(idl, PROGRAM_ID, provider));
      }
    }
    
    loadProgram();
  }, [connection, wallet]);

  useEffect(() => {
    async function checkRandomness() {
      if (!program) return;
      
      const [randomnessState] = PublicKey.findProgramAddressSync(
        [Buffer.from("randomness_state")],
        program.programId
      );
      
      try {
        const state = await program.account.randomnessState.fetch(randomnessState);
        setIsRandomnessReady(!state.isPending && state.lastUpdate > 0);
      } catch {
        setIsRandomnessReady(false);
      }
    }
    
    checkRandomness();
    const interval = setInterval(checkRandomness, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [program]);

  const handleSwap = async (amount: number) => {
    if (!program || !wallet.publicKey) return;
    
    if (!isRandomnessReady) {
      alert("Please generate randomness first!");
      return;
    }
    
    // Perform swap with random tier
    await swapWithRandomTier(program, amount);
  };

  return (
    <div>
      <h3>Swap Status</h3>
      <p>Randomness Ready: {isRandomnessReady ? '✅' : '❌'}</p>
      <button 
        onClick={() => handleSwap(1000000)}
        disabled={!isRandomnessReady}
      >
        Swap 1 DEFAI for Random NFT Tier
      </button>
    </div>
  );
}
```

## Testing Guide

### Local Testing
```bash
# Start local validator
solana-test-validator

# Deploy program
anchor deploy

# Initialize randomness (uses simple randomness automatically)
ts-node scripts/init-randomness.ts
```

### Devnet Testing
```bash
# Configure for devnet
solana config set --url devnet

# Initialize randomness
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=./admin-keypair.json \
ts-node scripts/init-randomness.ts
```

## Cost Considerations

### Switchboard On-Demand
- **Per Request**: ~0.002 SOL
- **Account Rent**: ~0.00144 SOL (recoverable)
- **Total per randomness**: ~0.00344 SOL

### Simple Randomness (Fallback)
- **Cost**: Only transaction fees (~0.000005 SOL)
- **Security**: Lower - suitable for testing only

## Troubleshooting

### Common Issues

1. **"Randomness not resolved yet"**
   - Wait for Switchboard oracle to process (3-5 seconds)
   - Check if transaction was confirmed

2. **"Invalid randomness account"**
   - Ensure the randomness account matches the committed one
   - Verify the account hasn't expired

3. **"No commitment found"**
   - Must call commit before reveal
   - Check if previous commit was successful

4. **Switchboard Errors on Devnet**
   - Devnet oracles may be intermittent
   - Use fallback simple randomness for testing

### Debug Commands

```bash
# Check randomness state
solana account <RANDOMNESS_STATE_PDA> --url devnet

# View program logs
solana logs EMwWSFW7rxS3Jh3CAsGYNwiYX6myucnFqFxTezBtaEvy --url devnet

# Monitor Switchboard queue health
curl https://api.switchboard.xyz/api/v1/queue/FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di
```

## API Reference

### Program Instructions

| Instruction | Description | Authority Required |
|------------|-------------|-------------------|
| `initialize_randomness_v2` | Initialize randomness state | Yes |
| `commit_randomness_v2` | Commit to using randomness | Yes |
| `reveal_randomness_v2` | Reveal random value | Yes |
| `generate_simple_randomness` | Generate using blockhashes | Yes |

### Account Structure

| Field | Type | Description |
|-------|------|-------------|
| `authority` | Pubkey | Program authority |
| `randomness_account` | Pubkey | Switchboard account |
| `committed_slot` | u64 | Slot of commitment |
| `revealed_value` | [u8; 32] | Random bytes |
| `last_update` | i64 | Unix timestamp |
| `is_pending` | bool | Awaiting reveal |

## Migration from Old VRF

If you have existing code using the old VRF implementation:

1. Replace `initializeVrfState` with `initializeRandomnessV2`
2. Replace `requestVrfRandomness` with `commitRandomnessV2`
3. Replace `consumeVrfRandomness` with `revealRandomnessV2`
4. Update account structures to use `randomnessState` instead of `vrfState`
5. Remove unnecessary Switchboard accounts (permission, escrow, etc.)

## Security Considerations

1. **Authority Control**: Only the program authority can initialize randomness
2. **Commit-Reveal**: Prevents manipulation by committing before revealing
3. **TEE Verification**: Switchboard uses TEE for verifiable randomness
4. **Fallback Safety**: Simple randomness uses multiple entropy sources

## Support

For issues or questions:
- Switchboard Discord: https://discord.gg/switchboard
- Switchboard Docs: https://docs.switchboard.xyz
- Repository Issues: https://github.com/your-repo/issues

---

*Last Updated: January 2025*
*Version: 2.0 (Switchboard On-Demand)*