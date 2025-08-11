# Feature Removal Options for Program Size Reduction

## Current Program Size: 730KB (too large for deployment)
## Target: < 600KB (typical Solana program limit)

Here are the features/instructions grouped by category that can be removed:

## 1. ❌ OLD/DEPRECATED FEATURES (Recommend Remove)
- `init_escrow_old` - Old escrow initialization (deprecated)
- `initialize_vrf_state` - Old VRF system (replaced by randomness_v2)
- `enable_vrf` - Old VRF system
- `request_vrf_randomness` - Old VRF system  
- `consume_vrf_randomness` - Old VRF system
- **Estimated savings: ~80KB**

## 2. 🔄 REDUNDANT SWAP VARIANTS (Choose which to keep)
### Keep ONE of these swap methods:
- `swap_og_tier0_for_pnft_v6` - For OG holders from MAY20DEFAIHolders.csv
- `swap_defai_for_pnft_v6` - Standard DEFAI to NFT swap
- `swap_old_defai_for_pnft_v6` - For old DEFAI token holders
- **Estimated savings: ~100KB per removed variant**

## 3. 🎲 BONUS/GAMING FEATURES (Optional)
- `reroll_bonus_v6` - Reroll NFT bonus attributes (gaming feature)
- `update_nft_metadata_v6` - Update NFT metadata (can be done off-chain)
- **Estimated savings: ~60KB total**

## 4. 💰 CLAIMING/VESTING FEATURES (Choose carefully)
- `claim_airdrop` - Airdrop claiming for 10_1AIR recipients
- `claim_vested_airdrop` - Vested airdrop claiming
- `claim_vested_v6` - Vesting claim for V6 NFT holders
- **Estimated savings: ~40KB each**

## 5. 🛠️ ADMIN FUNCTIONS (Keep minimal set)
### Less Critical Admin Functions:
- `propose_admin_change` & `accept_admin_change` - Two-step admin transfer (could use single-step)
- `initialize_whitelist` - Whitelist feature (may not be needed)
- `pause` & `unpause` - Pause functionality (keep for security?)
- `update_prices` - Price updates (could be immutable)
- `update_treasury` - Treasury updates (could be immutable)
- **Estimated savings: ~30KB total**

## 6. 🔢 TAX SYSTEM (Optional)
- `initialize_user_tax` - User tax tracking
- `reset_user_tax` - Tax reset functionality
- **Estimated savings: ~30KB**

## 7. 📦 MODULES TO CONSIDER REMOVING
- `vrf.rs` - Old VRF module (if removing old VRF instructions)
- `randomness.rs` - Old randomness module (keeping randomness_v2.rs)
- **Estimated savings: ~50KB**

---

## RECOMMENDED REMOVAL STRATEGY

### Minimal Removal (Quick Fix) - Save ~130KB:
1. ✅ Remove all old VRF functions (5 functions)
2. ✅ Remove `init_escrow_old`
3. ✅ Remove old randomness module
4. ✅ Remove vrf.rs module

### Moderate Removal - Save ~230KB:
Everything above plus:
1. ✅ Remove 2 of 3 swap variants (keep only `swap_defai_for_pnft_v6`)
2. ✅ Remove bonus/gaming features
3. ✅ Remove admin change proposal (use direct transfer)

### Aggressive Removal - Save ~350KB:
Everything above plus:
1. ✅ Remove all claiming/vesting (handle separately)
2. ✅ Remove tax system
3. ✅ Remove whitelist
4. ✅ Keep only essential admin functions

---

## FEATURES TO DEFINITELY KEEP:
1. ✅ `initialize` - Core initialization
2. ✅ `initialize_collection` - NFT collection setup
3. ✅ At least ONE swap function
4. ✅ `redeem_v6` - NFT to token redemption
5. ✅ New randomness system (randomness_v2)
6. ✅ Basic admin functions (withdraw)

---

## Please choose your removal strategy:
- [ ] Minimal (Remove deprecated only)
- [ ] Moderate (Remove deprecated + redundant)
- [ ] Aggressive (Keep core functionality only)
- [ ] Custom (Specify which features to remove)