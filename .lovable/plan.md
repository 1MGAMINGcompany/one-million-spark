

## Plan: Fix the Two Blocking Issues in the Prediction Submission Pipeline

### Problem Summary

All 5 test predictions failed because:
1. Native USDC was never converted to USDC.e
2. The USDC.e allowance for the fee relayer was never set (0 allowance)

### Fix 1 — Enforce USDC.e Balance Gate in TradeTicket / PredictionModal

**File:** `src/components/predictions/TradeTicket.tsx` and `src/components/predictions/PredictionModal.tsx`

Currently `PredictionModal` reads balance from `usePolygonUSDC` (which reads USDC.e). But the user may have Native USDC only. The fix:

- Import `usePolygonBalances` alongside `usePolygonUSDC`
- When `fundingState === "wrong_token"`, show a "Convert to Trading Balance" button instead of the submit button
- When `fundingState === "no_funds"`, show "Add Funds" link
- Only show the prediction submit button when `fundingState === "funded"`

### Fix 2 — Enforce Allowance Gate Before Submit

**File:** `src/hooks/useAllowanceGate.ts`

The allowance gate must check USDC.e allowance for the relayer and block submission until approved. Need to verify:
- It checks the correct token (USDC.e `0x2791...4174`, not Native USDC)
- It reads current allowance on mount
- If allowance < trade amount, it prompts an `approve` tx via Privy `useSendTransaction`
- The `approve` must target USDC.e contract with spender = relayer address
- Only after on-chain confirmation does `approvalStep` advance to `"ready"`

**File:** `src/components/predictions/TradeTicket.tsx`

- Wire the allowance gate status into the submit button: disable until `approvalStep === "ready"`
- Show a clear "Approve Trading" step indicator when approval is pending

### Fix 3 — Wire Swap Prompt into Prediction Flow

**File:** `src/pages/FightPredictions.tsx` or the modal open handler

When a user clicks "Predict" and has `fundingState === "wrong_token"`:
- Either redirect to `/add-funds` with a return URL
- Or show an inline "Convert" action that calls `useSwapToUsdce.getQuote()` and executes the swap

### Technical Details

**Token contracts:**
- Native USDC: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- USDC.e (required): `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- Relayer (spender): `0x3b3bf64329CCf08a727e4fEd41821E8534685fAD`

**Approve calldata:** Standard ERC-20 `approve(spender, amount)` on USDC.e contract. Use a large allowance (e.g. `MaxUint256`) so users only approve once.

**Files to modify:**
1. `src/components/predictions/PredictionModal.tsx` — add balance/funding state check
2. `src/components/predictions/TradeTicket.tsx` — add funding gate UI + allowance gate enforcement
3. `src/hooks/useAllowanceGate.ts` — verify correct token + working approval flow
4. `src/pages/FightPredictions.tsx` — pass funding state to modal

