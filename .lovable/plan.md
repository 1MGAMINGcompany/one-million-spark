

## Plan: Fix Long-Fail Path + Validate Browser Credential Flow

### What's Actually Happening

The DB shows credentials **are** being browser-derived and saved successfully (two saves on April 11). The API key `8b628afc-...` is stored and used. But every order submission gets `{"error":"Unauthorized/Invalid api key"}` from Polymarket's `/order` endpoint.

Timeline of the latest test:
- 18:35:49 — trade order created
- 18:35:50 — status set to `pending_client_submit`  
- 18:36:31 — credential re-derivation + save (retry path)
- 18:36:35 — finalized as failed (46 seconds total)

The ~46s wait is the credential re-derivation + retry cycle with no fast bailout.

### Root Cause Analysis

The "Invalid api key" error is from the L2 HMAC-authenticated `/order` endpoint — meaning the API key itself is not recognized by Polymarket, OR the HMAC signature doesn't match. Two suspects:

1. **Response field mapping mismatch**: `clobCredentialClient.ts` checks `data.apiKey || data.key` and `data.secret || data.apiSecret`. If Polymarket returns a different field name, we store the wrong value.

2. **Credential derivation returns success but credentials are non-functional**: The browser POST/GET to `/auth/api-key` may return 200 with credentials that are scoped to a different context (e.g., read-only) or the trading EOA was never properly registered with Polymarket's system.

### Implementation (4 Parts)

---

**PART 1: Fast failure + telemetry** (2 files)

`src/pages/FightPredictions.tsx` and `src/pages/platform/OperatorApp.tsx`:

- Wrap each step in a timing block (`performance.now()` deltas) and log via `dbg()`:
  - `predict:timing:session_check`
  - `predict:timing:submit`  
  - `predict:timing:first_clob_submit`
  - `predict:timing:credential_rederive`
  - `predict:timing:save_credentials`
  - `predict:timing:retry_clob_submit`
  - `predict:timing:confirm`

- On "Invalid api key" retry path:
  - If `deriveClobCredentials` fails → fail immediately with specific toast
  - If `polymarket-save-credentials` fails → fail immediately
  - If retry submit also gets "Invalid api key" → fail immediately, no further retries
  - Show: "Trading credentials could not be refreshed. Please sign out and sign back in to reset your trading session."

- Log the **full Polymarket response** (status code + body) in the credential derivation step so we can see exactly what `/auth/api-key` returned.

- Log the exact headers sent to `/order` (redacted api_secret) so we can compare against Polymarket's documented format.

---

**PART 2: Session healing** (1 file + 1 DB migration)

`src/hooks/usePolymarketSession.ts`:
- When status is `awaiting_browser_credentials` and derivation fails, explicitly set `canTrade = false` (already partially done, but tighten: don't set `canTrade = true` unless the save-credentials response confirms `status: active`)
- After successful credential save, re-check session via `check_status` before marking ready

DB migration:
- Reset the single active session that has stale credentials:
  ```sql
  UPDATE polymarket_user_sessions 
  SET pm_api_key = NULL, pm_api_secret = NULL, pm_passphrase = NULL, 
      status = 'awaiting_browser_credentials'
  WHERE authenticated_at < '2026-04-11T19:00:00Z' 
    AND pm_api_key IS NOT NULL;
  ```

---

**PART 3: Honest UX + audit trail** (2 files)

`src/components/predictions/PredictionSuccessScreen.tsx`:
- Change the `failed` status display from "No funds were taken" to:
  - "Your platform fee was collected but the exchange order was not executed. Reconciliation is in progress."

`supabase/functions/prediction-confirm/index.ts`:
- Add `failure_class` field to audit log entries:
  - `first_submit_rejected` — initial CLOB rejection
  - `refresh_attempted` — credential re-derivation was triggered
  - `refresh_failed` — re-derivation or save failed
  - `retry_rejected` — second CLOB submission also rejected
- Pass `failure_class` from the client in the confirm payload

---

**PART 4: Diagnostic logging for the real blocker** (2 files)

`src/lib/clobCredentialClient.ts`:
- Log the **full response body** from both `/auth/api-key` (POST) and `/auth/derive-api-key` (GET) — not just whether they succeeded
- Log the exact field names returned so we can verify mapping

`src/lib/clobOrderClient.ts`:
- Log a summary of the HMAC inputs (timestamp, method, path, body length) and the api_key being used (first 8 chars)
- Log the full Polymarket error response body on failure

### Files Changed
1. `src/pages/FightPredictions.tsx` — step timing, fast failure, specific error message
2. `src/pages/platform/OperatorApp.tsx` — same changes
3. `src/hooks/usePolymarketSession.ts` — tighten session healing
4. `src/components/predictions/PredictionSuccessScreen.tsx` — honest failure UX
5. `supabase/functions/prediction-confirm/index.ts` — failure classification audit
6. `src/lib/clobCredentialClient.ts` — diagnostic response logging
7. `src/lib/clobOrderClient.ts` — diagnostic header/error logging
8. DB migration — reset stale credentials

### Expected Outcome
- Failure in <5 seconds instead of 46 seconds
- Clear user-facing error message
- Full diagnostic trail showing exactly what Polymarket returned for credential derivation and why the order was rejected
- After one test with diagnostics, we'll know whether the blocker is: wrong field mapping, invalid credentials from derivation, HMAC format mismatch, or missing proxy wallet registration

### What Stays Unchanged
- Backend fee collection model
- Client-side order submission architecture  
- Reconciliation and pool accounting
- Operator attribution

