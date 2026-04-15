

## Plan: Fix Missing Payout Wallet for $0 Promo Operators

### Root Cause

The onboarding flow has a payout wallet step (step 6), but it has **no validation** — `isStepValid()` returns `true` by default for that step. Operators can click "Next" with an empty wallet field.

For $0 promo users specifically: they authenticate via Privy (which does create an embedded wallet), but the pre-fill logic at line 252 depends on `walletAddress` being ready. If the Privy wallet hasn't hydrated yet, the field stays empty and the user breezes past it.

### Fix (2 changes, minimal)

**1. Auto-default payout wallet from Privy wallet during `create_operator`**
In `src/pages/platform/OperatorOnboarding.tsx`, update `handleCreate` (line 468) to fall back to `walletAddress` if `payoutWallet` is empty:

```ts
payout_wallet: payoutWallet || walletAddress || null,
```

This ensures that even if the user skips the field, their Privy embedded wallet is used as the default destination.

**2. Add soft validation on the payout wallet step**
In `isStepValid()` (line 507), add a check for step 6 (the payout wallet step):

```ts
if (step === 6) return !!payoutWallet || !!walletAddress; // at least one must exist
```

This prevents proceeding only if there's truly no wallet available at all (edge case).

### What This Does NOT Change
- No logic changes to sweep, cash-out, or earnings
- No backend changes
- The payout wallet field remains optional to manually fill — but defaults to the Privy wallet automatically
- Existing operators (demo, silvertooth) still need their wallets set manually via admin or earnings tab

### For Existing $0 Promo Operators (demo, silvertooth)
After the code fix, we should update their `payout_wallet` in the DB to their Privy embedded wallet addresses so sweeps can begin flowing.

