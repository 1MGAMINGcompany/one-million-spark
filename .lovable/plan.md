

## Fix: Invalidate Stale Credentials + Add Auto-Re-derivation

### Root Cause
Wallet `0x3ed68845cf4528c80ff62094b52eeabca29db5a4` has `status: active` with `pm_api_key` populated from **April 9** — derived server-side through the Fly proxy. Those credentials are invalid (Polymarket revoked or never recognized them from the proxy IP). The `isSessionTradeReady()` check passes because the columns are non-null, so the bad keys get returned to the browser for order signing, producing "Invalid api key".

The browser-side credential derivation (`clobCredentialClient.ts`) only runs during **initial setup** — never for sessions that already have (bad) keys.

### Fix (3 changes)

**1. Invalidate existing stale credentials (DB migration)**
- Set `pm_api_key = NULL`, `pm_api_secret = NULL`, `pm_passphrase = NULL`, `status = 'awaiting_browser_credentials'` for all sessions where `authenticated_at < '2026-04-11'` (pre-browser-derivation era).
- This forces the browser re-derivation path on next trade attempt.

**2. `src/pages/FightPredictions.tsx` — Auto-trigger browser credential derivation on "Invalid api key" error**
- When `clobOrderClient` returns `errorCode: "clob_rejected"` with "Invalid api key" in the error message:
  - Import and call `deriveClobCredentials` from `clobCredentialClient.ts` using the trading key from the returned credentials
  - Save newly derived credentials via `polymarket-save-credentials`
  - Retry the order submission once with the fresh credentials
- Same change in `OperatorApp.tsx`

**3. `src/hooks/usePolymarketSession.ts` — Trigger browser derivation when session has trading key but no API keys**
- In `refreshSession`: if the backend returns `status: "awaiting_browser_credentials"` and the session has a trading key, automatically call `deriveClobCredentials` + save, then re-check status.
- This ensures credentials get re-derived proactively before the user even tries to trade.

### Files
- DB migration: clear stale credentials
- `src/pages/FightPredictions.tsx`: add retry-with-re-derivation on "Invalid api key"
- `src/pages/platform/OperatorApp.tsx`: same
- `src/hooks/usePolymarketSession.ts`: proactive re-derivation on `awaiting_browser_credentials`

### What This Does NOT Change
- No API keys to configure — these are per-user Polymarket CLOB credentials derived from the user's own trading key
- No platform secrets involved
- Fee collection, reconciliation, and pool accounting unchanged

