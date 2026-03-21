

## Audit Results: Prediction Submission Flow

### CRITICAL BUG — Will crash every Polymarket trade

**File**: `supabase/functions/prediction-submit/index.ts`

**Line 1179**: `walletLower` is referenced but **never defined** anywhere in the file. In ES module strict mode, this throws a `ReferenceError` at runtime.

**Impact**: After a Polymarket CLOB order is successfully submitted AND the fee is already collected, the `console.log` on line 1179 throws. The outer `catch` block (line 1302) catches this error and:
1. Marks the trade order as `status: "failed"` — even though the CLOB order was accepted
2. Returns a 500 error to the user — even though money was taken and the trade is live on Polymarket

This means: **fee collected + order placed on exchange + user sees "failed" + database says "failed"**. The background reconciliation worker may eventually correct the status, but the user experience is broken and funds appear lost.

**Line 1202**: Same `walletLower` bug in the else branch (when PM credentials are missing). Lower severity since PM secrets are currently configured, but still a latent crash.

**Line 1186-1190**: `pmSession` is referenced but never defined. Same else branch — would crash if PM env vars were ever removed. Latent bug only.

### Fix Plan

#### 1. Fix undefined variable references in prediction-submit
- **Line 1179**: Replace `walletLower` with `normalizedWallet`
- **Line 1202**: Replace `walletLower` with `normalizedWallet`  
- **Lines 1186-1190**: Replace `pmSession` references with checks against the already-defined env var variables (`pmApiKey`, `pmTradingKey`, etc.)

#### 2. No other blocking issues found

The rest of the flow audits clean:
- All 4 PM secrets are configured (PM_API_KEY, PM_API_SECRET, PM_PASSPHRASE, PM_TRADING_KEY)
- FEE_RELAYER_PRIVATE_KEY is configured
- PRIVY_APP_SECRET and VITE_PRIVY_APP_ID are configured
- JWKS retry logic is in place (3 attempts) in both preflight and submit
- Fee collection via relayer with allowance check works correctly
- Native (non-Polymarket) events fill immediately — no issues
- Frontend flow (preflight → allowance → submit) is properly sequenced
- System controls, daily limits, slippage checks, market allowlist — all functional
- Post-submit reconciliation with 2s timeout is properly handled

### Files to modify
- `supabase/functions/prediction-submit/index.ts` — Fix 3 undefined variable references (lines 1179, 1186-1190, 1202)

### Summary
Users **cannot** currently place Polymarket predictions successfully due to the `walletLower` crash. Native predictions would work fine. The fix is a 3-line variable rename.

