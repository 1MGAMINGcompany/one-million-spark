

## Plan: Fix Smart Wallet Approval Confirmation (UserOp Hash vs Tx Hash)

### What's Actually Wrong

The user confirms the approval wallet prompt works ("says accepted"), but the toast shows **"USDC approval failed"**. The screenshot confirms this exact toast.

**Root cause**: With Privy smart wallets (ERC-4337) and `sponsor: true`, `sendTransaction` returns a **UserOperation hash**, not a standard transaction hash. The `waitForReceipt` function polls `eth_getTransactionReceipt` with this UserOp hash, which **never resolves** because Polygon RPCs don't recognize UserOp hashes as transaction hashes. After 16 seconds of polling, it returns `{ found: false }` and the hook returns `{ success: false, error: "tx_not_confirmed_after_16s" }`.

Then in `FightPredictions.tsx` line 446: `throw new Error("tx_not_confirmed_after_16s")` — wait, this doesn't contain "approval" or "allowance"...

**Correction**: There's a second path. If `waitForReceipt` happens to find a receipt (perhaps Privy sometimes returns the actual tx hash), the approval IS confirmed, and we proceed to the 6-second wait + direct RPC allowance check. But the allowance check at line 455 uses `address!` from `usePrivyWallet()` which returns the **smart wallet** address. If `useSendTransaction` internally sends the `approve` call from the **embedded EOA** (not the smart wallet), then `allowance[EOA][relayer] = 100 USDC` but `allowance[smartWallet][relayer] = 0`. This causes the error at line 473: *"Approval confirmed but allowance not yet visible on-chain"* — which contains "allowance" and triggers the "USDC approval failed" toast.

**Either way, both failure paths stem from the same issue**: `useSendTransaction` with smart wallets behaves differently than expected for receipt/address resolution.

### Solution

**Step 1: Replace `waitForReceipt` with allowance-based confirmation**

Instead of polling for a transaction receipt (unreliable with UserOps), confirm the approval by polling the on-chain allowance directly. This works regardless of whether the hash is a UserOp hash or tx hash.

**Step 2: Add address diagnostics**

Log the exact address that `usePrivyWallet` returns vs. what Privy uses as the `from` for the approval. This captures whether there's an EOA/smart-wallet mismatch.

**Step 3: Retry allowance check with backoff**

Replace the single allowance check in `FightPredictions.tsx` with a retry loop (up to 4 attempts, 3s apart). Polygon block time is ~2s, so 12 seconds total should be more than enough for any confirmed tx to propagate.

### Files to Edit

- **`src/hooks/usePrivyFeeTransfer.ts`** — Replace `waitForReceipt` (tx receipt polling) with `waitForAllowance` (polls the ERC-20 allowance until it's non-zero or timeout). This is the primary fix.

- **`src/pages/FightPredictions.tsx`** — Remove the redundant post-approval allowance check (lines 452-474) since the hook now handles confirmation. Add diagnostic `console.log` of the wallet address being used.

### Technical Details

```text
Current flow (broken):
  sendTransaction → get hash → poll eth_getTransactionReceipt (fails for UserOps)
  → "tx_not_confirmed" → error

Fixed flow:
  sendTransaction → get hash → poll allowance(owner, relayer) via eth_call
  → allowance > 0 = success → proceed to backend submission
  → allowance still 0 after 20s = fail → clear error message
```

The `waitForAllowance` function will:
1. Accept the user's wallet address and the relayer address
2. Poll `allowance(owner, spender)` via `eth_call` on Polygon RPCs
3. Return success as soon as allowance >= 1 USDC (the approval cap is 100 USDC)
4. Timeout after ~20 seconds with a clear error

This approach is **chain-agnostic** — it works for EOA transactions, smart wallet UserOps, and any other execution path Privy might use internally.

