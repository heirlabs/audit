# Estate and App Factory - Auditor Fixes Applied

## Estate (security-auditor/defai_estate)

- Multisig initialization hardened:
  - Threshold must be > 1 and <= number of signers
  - Signers deduplicated; rejects duplicates
- Admin change acceptance restricted to `pending_admin` signer
- Multisig emergency unlock hardened:
  - `proposal.target_estate` must equal `estate`
  - `executor` must equal `proposal.proposer`
  - `proposal.approvals.len()` must be >= `multisig.threshold`
  - Proposal type must be `EmergencyUnlock` and already executed
- `UpdateBeneficiaries` account constraint no longer enforces `has_one = owner`; function keeps owner-or-multisig auth
- `ScanEstateAssets` uses `init_if_needed` to enable updates
- `CloseEstate` now owner-only (close authority and has_one) and checks claim completion

New errors added: `DuplicateSigner`, `InvalidProposalEstate`, `ProposerNotExecutor`, `NotEnoughApprovals`.

## App Factory (security-auditor/defai_app_factory)

- Cancel authority transfer now requires a pending transfer
- Update platform settings:
  - New treasury passed via context as `new_treasury` and validated to be a System account
  - Emits updated treasury key
- Purchase flow and refunds:
  - Record `purchase_price` at time of purchase for later refunds
  - Refunds use recorded price; validate treasury ATA has funds
  - Purchase contexts already include ATA preparations; kept separation to avoid stack issues
- Reviews: `UpdateReview` requires only the `reviewer` signer and binds PDA to reviewer
- Register app race fixed: instruction atomically sets mint and freeze authority to the app_registration PDA

All changes compile cleanly with no lint errors.


