

## Plan: Fix Approval Verification + Add Tx Receipt Confirmation

### Root Cause
The approval flow returns `success: true` as soon as it gets a transaction hash, WITHOUT confirming the transaction was actually mined and succeeded on-chain. On Polygon with Privy smart wallets (ERC-4337 UserOps), a hash can be returned before the underlying transaction is confirmed — or the UserOp could fail entirely while still returning a hash.

### Evidence
- Audit log at 18:36:21 shows `insufficient_allowance: have 0, need 20000`
- This is AFTER the frontend presumably ran the approval step
- The 4-second wait after approval may not be sufficient, or the approval TX reverted

### Fix (2 changes)

**1. Add on-chain receipt verification to `usePrivyFeeTransfer.ts`**

After getting the tx hash from `sendTransaction`, poll Polygon RPCs for the transaction receipt to confirm `status: 0x1` (success). This ensures we don't proceed with a failed/pending approval.

```text
Current flow:  sendTransaction → get hash → return success
Fixed flow:    sendTransaction → get hash → poll receipt (up to 15s) → verify status=0x1 → return success
```

**2. Increase propagation wait and add a fresh allowance re-check**

In `FightPredictions.tsx`, after approval succeeds:
- Increase wait from 4s to 6s
- Re-fetch allowance from RPC directly (don't rely on the polling hook's stale state)
- If allowance is still 0 after the wait, show an explicit error asking user to retry rather than silently submitting to a guaranteed failure

### Files to edit
- `src/hooks/usePrivyFeeTransfer.ts` — add receipt polling after sendTransaction
- `src/pages/FightPredictions.tsx` — add post-approval allowance verification

### Technical Details

In `usePrivyFeeTransfer.ts`, add a `waitForReceipt` helper that calls `eth_getTransactionReceipt` on Polygon RPCs in a loop (up to 8 attempts, 2s apart). Only return `success: true` when `receipt.status === "0x1"`.

In `FightPredictions.tsx`, after the approval wait, make a direct RPC call to check the new allowance before proceeding. If still 0, throw with a clear message instead of submitting to the backend.

