

# Fix: EVM Wallet Case Mismatch in Player Profile

## Problem
The URL contains a checksummed EVM address (mixed case like `0x3eD68845CF...`), but `prediction_entries.wallet` stores addresses in lowercase. The `.eq('wallet', wallet)` query is case-sensitive, so it returns 0 results and shows "Player not found".

## Solution
Normalize the wallet param to lowercase for all EVM address queries (addresses starting with `0x`). This affects both the `prediction_entries` head-check and all three parallel data fetches.

## Changes: `src/pages/PlayerProfile.tsx`

1. After extracting `wallet` from params, create a normalized query key:
```typescript
const queryWallet = wallet?.startsWith('0x') ? wallet.toLowerCase() : wallet;
```

2. Use `queryWallet` instead of `wallet` in all database queries:
   - `player_profiles` select
   - `prediction_entries` count check
   - `matches` select
   - `ratings` select
   - `prediction_entries` full select

3. Keep `wallet` (original case) for display purposes and URL generation.

This is a single-line addition plus find-replace of `wallet` → `queryWallet` in the query calls inside `fetchProfile`.

