

## Fix: Use Shared Backend CLOB Keys for Polymarket Predictions

### Root Cause Chain (confirmed from logs + DB)

1. User signs SIWE message → `polymarket-auth` calls Polymarket CLOB `/auth/derive-api-key` → **returns 405 (Method Not Allowed)**
2. Session stored with `status: "awaiting_credentials"`, `pm_api_key: null`
3. Frontend receives `success: true` but `can_trade: false` → shows "Polymarket connected!" (misleading)
4. Prediction continues to `prediction-preflight` → JWKS fetch to `auth.privy.io` fails with "Expected 200 OK" → **the error in the screenshot**
5. Even if preflight passed, `prediction-submit` would reject because `isSessionValid` requires all 4 CLOB credentials

### Solution: Shared Backend Keys

Since you have existing Polymarket CLOB keys, we skip per-user credential derivation entirely. The backend uses a single set of CLOB credentials stored as secrets.

### Changes

**Step 1: Add 4 secrets** (via `add_secret` tool)
- `PM_API_KEY` — your Polymarket CLOB API key
- `PM_API_SECRET` — your CLOB API secret
- `PM_PASSPHRASE` — your CLOB passphrase
- `PM_TRADING_KEY` — your CLOB trading private key (hex)

**Step 2: `supabase/functions/prediction-submit/index.ts`**
- In the Polymarket order block (lines 948-1189), instead of looking up `polymarket_user_sessions`, read credentials from `Deno.env.get("PM_API_KEY")` etc.
- Remove the `isSessionValid` check against `polymarket_user_sessions`
- Keep all other safety gates (price freshness, limits, fee verification)

**Step 3: `src/pages/FightPredictions.tsx`**
- Remove the entire Step 0 block (lines 287-311) that triggers SIWE signing and `deriveCredentials`
- Users go straight to preflight → allowance → submit with zero extra prompts

**Step 4: `src/hooks/usePolymarketSession.ts`**
- Simplify to a no-op or remove entirely — no longer needed since credentials are backend-only
- Remove the polling that calls `polymarket-auth` every 30s

**Step 5: `supabase/functions/prediction-preflight/index.ts`**  
- Increase retry attempts from 2 to 3 and add a longer backoff to handle transient JWKS failures more reliably

### What stays the same
- Prediction preflight (Privy JWT check) — still needed for auth
- Relayer fee model (one-time USDC allowance + `transferFrom`)
- All safety gates in `prediction-submit` (limits, price staleness, slippage)
- Smart wallet resolution for fee collection

### Post-fix user flow
1. User clicks "Predict" → enters amount → clicks "Submit"
2. Preflight checks Privy JWT (no SIWE, no extra signing)
3. One-time USDC allowance if needed (existing flow)
4. Backend collects fee via relayer, submits CLOB order using shared keys
5. Done — no Polymarket connection step at all

