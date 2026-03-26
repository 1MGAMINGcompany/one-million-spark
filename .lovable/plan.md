

# Fix: Backend Allowance Check Must Poll Both Smart Wallet and EOA

## Problem
Every prediction attempt fails with `insufficient_allowance: have 0, need 20000`. The approval transaction is confirmed on-chain, but the backend checks the wrong address.

## Root Cause
1. Privy's `useSendTransaction` executes the `approve()` call FROM the embedded EOA (not the Smart Wallet)
2. The frontend correctly polls both addresses and proceeds when the EOA has allowance
3. The backend `collectFeeViaRelayer()` only checks allowance for the wallet address sent in the request body (the Smart Wallet address `0x3eD68845...`)
4. The Smart Wallet has 0 allowance because the approval was set by the EOA

## Fix

### 1. Send both addresses from frontend to backend
Update `FightPredictions.tsx` to include the EOA address in the prediction-submit request body alongside the Smart Wallet address.

### 2. Update `prediction-submit` to check allowance on both addresses
In `collectFeeViaRelayer()`, check allowance for both the Smart Wallet and EOA. Execute `transferFrom` using whichever address actually has the allowance.

### Technical Detail

**Frontend change** (`src/pages/FightPredictions.tsx`):
```typescript
body: {
  fight_id: selectedFight.id,
  wallet: address,        // Smart Wallet
  wallet_eoa: eoaAddress, // EOA — new field
  fighter_pick: selectedPick,
  amount_usd: amountUsd,
}
```

**Backend change** (`supabase/functions/prediction-submit/index.ts`):
- Accept `wallet_eoa` from request body
- In `collectFeeViaRelayer`, check allowance on both `userWallet` and `walletEoa`
- Use the address that has sufficient allowance as the `from` in `transferFrom`
- Log which address was used for audit transparency

## Files Changed
- `src/pages/FightPredictions.tsx` — send `wallet_eoa` in submit body
- `supabase/functions/prediction-submit/index.ts` — dual-address allowance check + transferFrom from correct address

