

## Fix: "Invalid api key" — Credential Derivation Must Move Client-Side

### Root Cause
The CLOB API credentials (`pm_api_key`, `pm_api_secret`, `pm_passphrase`) stored in `polymarket_user_sessions` were derived by the backend edge function (`polymarket-user-setup`) through the Fly.io proxy. Polymarket likely rejected or returned invalid credentials because the `/auth/api-key` and `/auth/derive-api-key` endpoints are also geo-blocked or IP-flagged for proxy traffic — same as `/order`.

The error `{"error":"Unauthorized/Invalid api key"}` confirms the stored `pm_api_key` itself is not recognized by Polymarket. This is not an HMAC issue (wrong signature would give a different error).

### Fix: Move credential derivation to the browser

Same pattern as the order submission shift. The browser signs L1 EIP-712 auth headers and calls Polymarket's `/auth/api-key` or `/auth/derive-api-key` directly from the user's residential IP.

### Changes

**1. New client-side module: `src/lib/clobCredentialClient.ts`**
- Takes the user's trading key (already derived server-side and stored)
- Builds L1 EIP-712 auth headers (same as `polymarket-user-setup` does)
- Calls `POST https://clob.polymarket.com/auth/api-key` from the browser
- Falls back to `GET https://clob.polymarket.com/auth/derive-api-key`
- Returns `{ apiKey, apiSecret, passphrase }` to the caller

**2. New edge function: `supabase/functions/polymarket-save-credentials/index.ts`**
- Accepts `{ api_key, api_secret, passphrase }` from the browser after successful derivation
- Verifies Privy JWT, resolves wallet
- Updates `polymarket_user_sessions` with the new credentials
- Sets `status = "active"`, `authenticated_at = now()`

**3. Update `src/hooks/usePolymarketSession.ts`** (or equivalent setup flow)
- After server-side `polymarket-user-setup` returns the trading key but no valid credentials:
  - Call `clobCredentialClient.deriveCredentials(tradingKey)` from the browser
  - POST results to `polymarket-save-credentials`
  - Session is now trade-ready

**4. Update `src/pages/FightPredictions.tsx`**
- Before client-side order submission, check if credentials are present
- If `prediction-submit` returns `trading_wallet_setup_required`, trigger browser-side credential derivation automatically
- Then retry the submission

**5. Update `supabase/functions/polymarket-user-setup/index.ts`**
- In `derive_and_setup`: still derive the trading key server-side (deterministic from SIWE)
- But skip the CLOB API credential derivation calls (remove `deriveClobApiCreds`)
- Return the trading key to the client and let the browser handle credential creation
- Set session status to `awaiting_browser_credentials` instead of `active`

### Flow After Fix

```text
1. User clicks "Set up trading wallet"
2. Browser → polymarket-user-setup → derives trading key, returns it
3. Browser → POST clob.polymarket.com/auth/api-key (direct, residential IP)
4. Browser → polymarket-save-credentials → stores api_key/secret/passphrase
5. Session is now trade-ready
6. User places prediction → prediction-submit returns order_params + credentials
7. Browser → POST clob.polymarket.com/order (direct, residential IP)
8. Browser → prediction-confirm → finalizes entry
```

### Security
- Trading key is already returned to the client for order signing — no new exposure
- API credentials are per-user, derived from their own trading key
- Credentials stored in DB same as before, just derived from browser instead of server

### Files
- Create `src/lib/clobCredentialClient.ts`
- Create `supabase/functions/polymarket-save-credentials/index.ts`
- Update `supabase/functions/polymarket-user-setup/index.ts`
- Update `src/pages/FightPredictions.tsx`
- Update `src/hooks/usePolymarketSession.ts`
- Update `supabase/config.toml` (add `polymarket-save-credentials`)

