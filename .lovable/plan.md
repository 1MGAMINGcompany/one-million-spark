

## Plan: Fix Stuck USDC Approval Transaction

### Problem
The Privy "Confirm address" modal shows correctly (gas sponsored), but the transaction hangs on "Loading..." and never completes. The **$1.68** shown is your wallet balance — not the prediction amount.

### Root Cause
The `sendTransaction` call is missing the `chainId: 137` (Polygon) parameter. Without explicit chain routing, the Privy SDK may fail to resolve the correct network for the UserOperation, causing the transaction to hang indefinitely.

### Fix (1 file)

**`src/hooks/usePrivyFeeTransfer.ts`**
- Add `chainId: 137` to the transaction request to explicitly target Polygon
- This ensures the smart wallet routes the approval to the correct chain and the paymaster can properly sponsor it

```typescript
// Before (missing chainId — hangs):
await sendTransaction(
  { to: USDC_CONTRACT, data, value: 0 },
  { sponsor: true }
);

// After (explicit Polygon routing):
await sendTransaction(
  { to: USDC_CONTRACT, data, value: 0, chainId: 137 },
  { sponsor: true }
);
```

Single line change, should resolve the stuck modal.

