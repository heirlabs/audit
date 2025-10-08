# DefAI App Factory - TON Implementation

This is a FunC implementation of the DefAI App Factory contract for the TON blockchain, transpiled from the original Solidity contract.

## Features

The contract implements the following functionality:

### Core Features
- **App Registration**: Creators can register new apps with price, max supply, and metadata
- **App Purchasing**: Users can purchase app access using DEFAI tokens (Jettons on TON)
- **NFT/SFT Minting**: Each purchase mints a non-transferable token representing app access
- **Review System**: Users who own apps can submit and update reviews with ratings (1-5)
- **Refund Management**: Creators can issue refunds to users
- **Platform Fees**: Configurable platform fee (in basis points) on all purchases

### Admin Features
- **Pause/Unpause**: Contract owner can pause/unpause all operations
- **Platform Settings**: Update platform fee and treasury address
- **App Management**: Creators can toggle app status and update metadata

## Contract Structure

### Storage Layout
```
- owner_address: Contract owner
- treasury_address: Platform treasury for fees
- defai_jetton_wallet: Jetton wallet for DEFAI token operations
- platform_fee_bps: Platform fee in basis points (10000 = 100%)
- is_paused: Contract pause status
- next_app_id: Counter for app IDs
- apps: Dictionary of app registrations
- user_access: Nested dictionary tracking user access to apps
- reviews: User reviews for apps
- refunds: Refund records
- app_total_ratings: Total ratings per app
- app_review_counts: Review count per app
```

### Operations (Op Codes)

| Op Code | Operation | Description |
|---------|-----------|-------------|
| 0x1 | register_app | Register a new app |
| 0x2 | purchase_app | Purchase app access |
| 0x3 | toggle_app_status | Enable/disable app |
| 0x4 | update_app_metadata | Update app metadata/price |
| 0x5 | submit_review | Submit app review |
| 0x6 | update_review | Update existing review |
| 0x7 | refund_purchase | Process refund |
| 0x8 | update_platform_settings | Update platform config |
| 0x9 | pause | Pause contract |
| 0xa | unpause | Unpause contract |
| 0xb | batch_purchase | Purchase multiple apps |

### Get Methods

- `get_contract_data()`: Returns contract configuration and stats
- `get_app(app_id)`: Returns app registration details
- `get_user_has_access(user, app_id)`: Check if user owns app
- `get_app_average_rating(app_id)`: Get average rating (multiplied by 100 for precision)
- `get_total_apps()`: Get total number of registered apps

## Message Format

### Register App
```
op: 0x1
query_id: uint64
price: Coins
max_supply: uint32
metadata_uri: ref<string>
```

### Purchase App
```
op: 0x2
query_id: uint64
app_id: uint32
payment_amount: Coins
```

### Submit Review
```
op: 0x5
query_id: uint64
app_id: uint32
rating: uint8 (1-5)
comment_cid: ref<string>
```

## TypeScript Wrapper

The included TypeScript wrapper (`defai_app_factory_wrapper.ts`) provides a convenient interface for interacting with the contract:

```typescript
import { DefaiAppFactory } from './defai_app_factory_wrapper';

// Deploy contract
const factory = DefaiAppFactory.createFromConfig({
    owner: ownerAddress,
    treasury: treasuryAddress,
    jettonWallet: jettonWalletAddress,
    platformFeeBps: 500 // 5% fee
}, code);

// Register app
await factory.sendRegisterApp(provider, sender, {
    value: toNano('0.1'),
    price: toNano('100'),
    maxSupply: 1000,
    metadataUri: 'ipfs://...'
});

// Purchase app
await factory.sendPurchaseApp(provider, sender, {
    value: toNano('0.1'),
    appId: 0,
    paymentAmount: toNano('100')
});

// Get app details
const app = await factory.getApp(provider, 0);
```

## Differences from Solidity

1. **Token Standard**: Uses Jettons (TON's fungible token standard) instead of ERC20
2. **NFT Implementation**: Access tokens are tracked in contract storage rather than using a separate NFT standard
3. **Message-based**: All interactions are through internal messages with op codes
4. **Storage**: Uses dictionaries (hashmaps) for dynamic data structures
5. **Error Handling**: Uses numeric error codes with throw_if/throw_unless
6. **No Reentrancy Guard**: TON's actor model naturally prevents reentrancy
7. **Address Format**: Uses TON's MsgAddress format

## Security Considerations

1. **Authorization**: All privileged operations check sender authorization
2. **Pause Mechanism**: Contract can be paused to prevent operations in emergencies
3. **Input Validation**: All inputs are validated for size limits and valid ranges
4. **Balance Checks**: Verifies sufficient balance before transfers
5. **State Consistency**: Updates are atomic within message processing

## Building and Deployment

1. Compile the FunC contract:
```bash
func -o defai_app_factory.fif -SPA defai_app_factory.fc
```

2. Deploy using the TypeScript wrapper with ton-core library

3. Initialize with appropriate owner, treasury, and jetton wallet addresses