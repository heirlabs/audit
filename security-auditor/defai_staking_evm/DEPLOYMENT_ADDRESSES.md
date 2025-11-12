# DeFAI Staking Deployment Addresses

## Base Sepolia Testnet (Chain ID: 84532)

### Contract Addresses

| Contract | Address | Purpose |
|----------|---------|---------|
| **HEIR Token** | `0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42` | Mock HEIR token for staking |
| **Staking Contract (Proxy)** | `0x92287607a566BD02dC41A9dd5eF845C397b14828` | ✅ **USE THIS FOR STAKING** |
| **ProxyAdmin** | `0xc23c4A433833C7D3713912E3cd3b01EB957010dC` | Controls contract upgrades |
| **Implementation** | `0xc30FcC9ad0F0233843F2171F587AE44086e92ffa` | Current staking logic |

### Staking Tiers

| Tier | Minimum | Maximum | APY | Lock Period |
|------|---------|---------|-----|-------------|
| **Gold** | 10M HEIR | 100M HEIR | 0.5% | 7 days |
| **Titanium** | 100M HEIR | 1B HEIR | 0.75% | 7 days |
| **Infinite** | 1B HEIR | Unlimited | 1% | 7 days |

### Explorer Links

- [Staking Contract](https://sepolia.basescan.org/address/0x92287607a566BD02dC41A9dd5eF845C397b14828)
- [HEIR Token](https://sepolia.basescan.org/address/0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42)
- [ProxyAdmin](https://sepolia.basescan.org/address/0xc23c4A433833C7D3713912E3cd3b01EB957010dC)

### Important Notes

1. **For Users**: Stake HEIR tokens at `0x92287607a566BD02dC41A9dd5eF845C397b14828`
2. **For Admin**: Fund the contract with HEIR tokens for rewards
3. **Upgradeability**: Contract can be upgraded through ProxyAdmin
4. **Token Supply**: 100 billion HEIR total supply (50% sent to 0x48b2680068f311e7d777dc9502957325dae1df99)

### Deployment Info

- **Network**: Base Sepolia
- **Deployer**: `0x02C9e22e4cC04f1E44b06d0f445D8a8fA66e5c6C`
- **Deployment Date**: January 2025
- **Contract Version**: Upgradeable (UUPS pattern)