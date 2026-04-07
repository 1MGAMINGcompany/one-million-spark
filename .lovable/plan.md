

# Fix: Prediction Failing for Users Without Polymarket Trading Session

## Root Cause

The edge function logs show:
```
[prediction-submit] No per-user CLOB session for 0x3ed68845cf4528c80ff62094b52eeabca29db5a4 — using native pool accounting
```

Two bugs are causing this:

1. **Fee stolen on failed trades**: The fee ($0.02) is collected at line ~1094 BEFORE the Polymarket session check at line ~1168. When the session check fails, the trade is rejected but the fee is already taken from the user's wallet — they lose money for nothing.

2. **Error code mismatch**: The backend returns `no_trading_session` (line 1475), but the frontend only checks for `trading_wallet_setup_required` (line 446 of OperatorApp.tsx). So the auto-setup flow never triggers — the user just sees a generic "Prediction failed" toast with no guidance.

## Fix Plan

### 1. Move PM session check before fee collection
**File**: `supabase/functions/prediction-submit/index.ts`

After the Polymarket-specific validations block (~line 922) and before fee collection (~line 1094), add an early check for `polymarket_user_sessions`. If no active session exists for this wallet on a Polymarket-backed fight, return immediately with `error_code: "trading_wallet_setup_required"` — before any money moves.

### 2. Fix error code in the existing late check
**File**: `supabase/functions/prediction-submit/index.ts` (line 1464)

Change `error_code: "no_trading_session"` to `error_code: "trading_wallet_setup_required"` so both early and late checks match what the frontend expects.

### 3. Frontend: also handle `no_trading_session`
**File**: `src/pages/platform/OperatorApp.tsx` (line 446)

Add `no_trading_session` to the error code check so the auto-setup triggers even if the backend uses either code. This is a safety net.

## Expected Outcome
- User without a Polymarket session sees a prompt to set up their trading wallet
- No fee is collected until the session exists
- The `setupTradingWallet()` flow triggers automatically via SIWE signature

