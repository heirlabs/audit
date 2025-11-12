# DeFAI Contracts - Production Addresses

## Base Sepolia Testnet (Chain ID: 84532)

### Core Contracts

#### Staking Contract (MAIN)
- **Proxy Address:** `0x92287607a566BD02dC41A9dd5eF845C397b14828` ✅ **USE THIS FOR ALL STAKING**
- **Implementation:** `0xc30FcC9ad0F0233843F2171F587AE44086e92ffa`
- **ProxyAdmin:** `0xc23c4A433833C7D3713912E3cd3b01EB957010dC`
- **Explorer:** https://sepolia.basescan.org/address/0x92287607a566BD02dC41A9dd5eF845C397b14828

#### HEIR Token
- **Address:** `0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42`
- **Symbol:** HEIR
- **Decimals:** 6
- **Total Supply:** 100,000,000,000 HEIR
- **Distribution:** 50% sent to `0x48b2680068f311e7d777dc9502957325dae1df99`
- **Explorer:** https://sepolia.basescan.org/address/0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42

#### DeFAI App Factory
- **Address:** `0xC5eF60B8F7f88054659dfDdC67163342f46A26f3`
- **Features:** Updateable token address to avoid redeployment
- **Explorer:** https://sepolia.basescan.org/address/0xC5eF60B8F7f88054659dfDdC67163342f46A26f3

### Staking Configuration

| Tier | Minimum | Maximum | APY | Lock Period |
|------|---------|---------|-----|-------------|
| **Gold** | 10,000,000 HEIR | 99,999,999 HEIR | 0.5% | 7 days |
| **Titanium** | 100,000,000 HEIR | 999,999,999 HEIR | 0.75% | 7 days |
| **Infinite** | 1,000,000,000 HEIR | Unlimited | 1% | 7 days |

### Important Information

1. **For Users:**
   - Stake HEIR tokens at: `0x92287607a566BD02dC41A9dd5eF845C397b14828`
   - Approve tokens before staking
   - Check tier requirements before staking

2. **For Administrators:**
   - Fund the staking contract with HEIR tokens for rewards
   - Contract supports upgrades via ProxyAdmin
   - Can pause/unpause staking as needed
   - Can update token address in factory contract

3. **Security Features:**
   - Upgradeable (UUPS pattern)
   - Role-based access control
   - Pausable in emergencies
   - Reentrancy protection

### Deployment Details
- **Network:** Base Sepolia
- **Deployer:** `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`
- **Date:** January 2025
- **Architecture:** Upgradeable proxy pattern for future improvements