
Audit + remediation plan

Do I know what the issue is?
Yes. The Fly.io proxy is probably still useful for backend CLOB access, but it is not the main issue by itself. The app currently has multiple deeper Polymarket integration mismatches plus a separate stale-market lifecycle bug.

What I found

1. Core Polymarket integration drift
- Official Polymarket docs use:
  - L1 EIP-712 auth to create/derive L2 credentials
  - L2 HMAC auth for trading
  - wallet-type-specific `signatureType` and `funder` (`EOA=0`, `POLY_PROXY=1`, `GNOSIS_SAFE=2`)
- Your code is inconsistent:
  - `prediction-submit` and `prediction-sell` hardcode `signatureType: 0`
  - `pm-verify-credentials` uses the SDK `ClobClient` with a configurable signature type/funder model
  - `polymarket-user-setup` stores `safe_address`, `safe_deployed`, and `approvals_set`, but order submission never uses a Safe/proxy signature model
- That means the app is mixing an EOA order model with an optimistic Safe/proxy session model.

2. Order submission model likely does not match the intended product flow
- Current code hand-builds a BUY order and posts it as `orderType: "GTC"`.
- Polymarket docs for instant execution emphasize market-order semantics with FOK/FAK and a worst-price limit.
- So even if the proxy works, the app may still reject or mis-handle orders because the signed payload model is drifting from the documented path.

3. Two Polymarket auth/setup implementations exist
- `polymarket-user-setup` is the active app path
- `polymarket-auth` is still present with a different derivation flow
- This is a maintenance and correctness problem.

4. Frontend still assumes an old fallback that backend removed
- UI comments/logic still say “shared fallback” exists
- backend comments/logic in `prediction-submit` show per-user sessions only
- So the UI is guiding the flow with outdated assumptions

5. Old matches are not disappearing because backend and frontend disagree on lifecycle
- `OperatorApp` loads `open/live/locked` fights for the last 7 days and does not exclude `polymarket_active = false`
- `FightPredictions` only excludes `settled/cancelled`, so resolved/confirmed/refund states can linger
- `polymarket-prices` can mark a resolved market as:
  - `polymarket_active = false`
  - `status = "locked"`
  This keeps dead markets browseable
- `prediction-result-detect` is the function that should move closed Polymarket markets to `confirmed`, but browse filters are too loose to depend on that safely

6. Public live pricing and server execution use different channels
- Browser prices come from direct Polymarket WebSocket
- Server execution uses backend fetches via `getClobUrl()`
- So quote display and actual execution path can diverge

7. Financial safety needs review
- `prediction-submit` collects the fee before final exchange placement
- If funding/order placement fails afterward, I do not see a guaranteed automatic fee rollback path in the current flow

What this means
- Fly.io may still be needed, but it is not the root explanation for everything.
- The strongest evidence is the wallet/signature mismatch:
  - verifier path uses SDK + signatureType/funder
  - live trade path hardcodes EOA signing
- The stale matches problem is definitely separate and caused by query/filter/lifecycle logic.

Implementation plan

Phase 1 — Canonicalize the Polymarket path
- Keep one setup flow: `polymarket-user-setup`
- Merge/remove `polymarket-auth`
- Make session data represent the real wallet model actually used for order placement
- Update `pm-verify-credentials` to validate the same runtime model the app submits with

Phase 2 — Fix trade submission to match docs
- Refactor `prediction-submit` and `prediction-sell` to use one coherent Polymarket model:
  - correct `signatureType`
  - correct `funder`
  - official create/derive credential flow
  - market-order/FOK-or-FAK behavior for instant fills
- If markets need `negRisk`, carry that metadata through too

Phase 3 — Remove stale frontend assumptions
- Update `FightPredictions.tsx` and `OperatorApp.tsx`
- Remove “shared fallback” behavior/comments
- Gate trade flow on the real per-user readiness model
- Keep requote handling, but tighten exchange error mapping

Phase 4 — Fix old matches not erasing
- In `polymarket-prices`, stop setting resolved markets to `locked`
- Let resolved markets move to `confirmed/cancelled` through the proper result path
- Tighten browse queries to exclude:
  - `polymarket_active = false`
  - stale past events beyond a short grace window
  - inactive resolved fights from browse surfaces
- Keep past/resolved fights only in My Picks / Past sections

Phase 5 — Audit the automation chain
- Verify these do not fight each other:
  - `polymarket-prices`
  - `prediction-result-detect`
  - `prediction-result-worker`
  - `prediction-schedule-worker`
  - `prediction-auto-settle`
- Add recovery for “closed on Gamma but still browseable locally”

Phase 6 — Financial safety pass
- Review fee capture ordering
- Either move fee capture later or add a guaranteed rollback/refund path after downstream failures
- Ensure failed/no-order trades never look like real executed positions

Files to change
- `supabase/functions/polymarket-user-setup/index.ts`
- `supabase/functions/polymarket-auth/index.ts`
- `supabase/functions/prediction-submit/index.ts`
- `supabase/functions/prediction-sell/index.ts`
- `supabase/functions/pm-verify-credentials/index.ts`
- `supabase/functions/polymarket-prices/index.ts`
- `supabase/functions/prediction-result-detect/index.ts`
- `src/pages/FightPredictions.tsx`
- `src/pages/platform/OperatorApp.tsx`

Expected result
- Trade auth/order construction matches Polymarket’s documented model
- Proxy is just transport, not a band-aid for deeper integration drift
- Dead markets disappear from browse views quickly
- Past results remain visible only where they belong
- Failures become accurate: geo issue, credentials issue, wallet-model issue, slippage issue, or exchange rejection
