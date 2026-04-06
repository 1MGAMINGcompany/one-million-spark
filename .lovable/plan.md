

# Fix: Predictions Not Appearing in "My Picks" + Balance Not Refreshing

## Root Cause

### Problem 1 — "My Picks" shows nothing (PRIMARY)
**Case-sensitivity mismatch.** The database stores wallet addresses in lowercase (e.g. `0x3ed68845cf4528c80ff62094b52eeabca29db5a4`), but Privy returns checksummed mixed-case addresses (e.g. `0x3Ed68845Cf4528C80fF62094B52EEAbca29DB5A4`). PostgreSQL `eq` comparison is case-sensitive, so:

```sql
-- Returns 0 rows when address has uppercase letters
SELECT * FROM prediction_entries WHERE wallet = '0x3Ed68845Cf...'
```

The query at line 198 of `OperatorApp.tsx` uses `.eq("wallet", address)` without lowercasing, so it never finds the user's entries.

**This also explains why the balance appears unchanged** — the prediction DID execute (trade order is `filled`, entry exists), but the user's USDC.e was spent on the Polymarket fee/trade. The balance polling (every 15s) should eventually reflect the deduction, but since it's only $1, the change may be too small to notice in the formatted display.

### Problem 2 — Balance display granularity
The USDC balance is formatted to 2 decimal places. A $1 prediction with a 2% fee means only $0.02 was deducted from the user's actual wallet (the fee portion). The $0.98 net amount goes through Polymarket's CLOB as a trade, not directly from the user's USDC balance. So the balance change is minimal and may look unchanged.

## Fix Plan

### File 1: `src/pages/platform/OperatorApp.tsx`
**Single change** — lowercase the wallet address when querying prediction_entries:

Line 198: Change `.eq("wallet", address)` to `.eq("wallet", address.toLowerCase())`

This ensures the query matches the lowercase addresses stored by the backend.

### File 2: `src/pages/FightPredictions.tsx`  
**Same fix** — line 288 also queries prediction_entries by wallet without lowercasing. Apply the same `.toLowerCase()` fix for consistency.

## What is NOT Changed
- Backend submission logic — working correctly (trade filled)
- Balance hooks — polling already works, the small deduction is expected
- Settlement, payouts, claims — untouched
- Auth, routing, themes — untouched

## Expected Result
- After placing a prediction, "My Picks" tab shows the entry immediately
- Existing past entries also appear correctly
- Balance reflects the small fee deduction on next poll cycle

