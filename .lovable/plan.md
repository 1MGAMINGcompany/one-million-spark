

## Plan: Fix Relayer Address Mismatch + Bypass MATIC Funding Issue

### What's Actually Wrong (Two Stacked Issues)

**Issue 1 — Allowance spender mismatch (the real blocker)**
- Frontend approves `0x72F3...88d` (TREASURY_WALLET) as the spender
- Backend checks allowance against the address derived from `FEE_RELAYER_PRIVATE_KEY` (line 274)
- If these are different addresses, allowance will always be 0 from the relayer's perspective
- This is why every trade fails with `insufficient_allowance: have 0`

**Issue 2 — Relayer needs MATIC for gas**
- Even after fixing the allowance, the relayer wallet (derived from `FEE_RELAYER_PRIVATE_KEY`) needs MATIC to send the `transferFrom` transaction
- The Polymarket wallet you showed is unrelated — it's the CLOB API trading identity, not the fee relayer

### Solution

**Step 1: Create `prediction-health` diagnostic endpoint**
- Derives the actual relayer address from `FEE_RELAYER_PRIVATE_KEY` and returns it
- Checks the relayer's MATIC balance via Polygon RPC
- Tests Polymarket CLOB connectivity
- Reports whether relayer address matches the hardcoded `TREASURY_WALLET`
- This tells you exactly which address needs MATIC funding

**Step 2: Fix the frontend approval target**
- Update `usePolygonUSDC.ts` and `usePrivyFeeTransfer.ts` to fetch the correct relayer address from the health endpoint (or update the hardcoded constant to match)
- If the relayer key IS the treasury key, they already match and the issue is elsewhere
- If they differ, the frontend must approve the relayer address, not the treasury

**Step 3: Fund the correct wallet**
- Once you know the relayer's derived address, send MATIC there (not to the Polymarket API wallet)
- Only ~0.1 MATIC is needed for hundreds of `transferFrom` calls (~30k gas each at ~30 gwei)

### Files
- **Create**: `supabase/functions/prediction-health/index.ts` — diagnostic endpoint
- **Edit**: `src/hooks/usePolygonUSDC.ts` — align `FEE_RELAYER_ADDRESS` with actual relayer
- **Edit**: `src/hooks/usePrivyFeeTransfer.ts` — same alignment

### Why This Unblocks Everything
Once the frontend approves the correct spender AND that spender has MATIC, the existing `collectFeeViaRelayer` code will work as-is — and the flow will finally reach Polymarket CLOB submission.

