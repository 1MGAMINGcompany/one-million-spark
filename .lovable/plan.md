
Goal

Fix the two still-live problems:
1. old matches are still showing
2. the same $1 prediction failure is still happening

What I found

- On the current `/` route, the old matches are still coming from `src/pages/Home.tsx`. That query is still broad: it only excludes `settled/cancelled`, looks back 7 days, and does not exclude `polymarket_active = false`.
- `src/pages/FightPredictions.tsx` is also still too loose. It excludes several final statuses, but it still does not filter out `polymarket_active = false`.
- `supabase/functions/prediction-schedule-worker/index.ts` is actively turning stale `live` fights into `locked`, and the worker logs show it doing this for many old events. Because the UI still treats `locked` fights as browseable, those stale matches continue to surface.
- The earlier requote/banner fix only addressed a UI symptom. The actual trade execution path still has deeper drift:
  - `supabase/functions/prediction-submit/index.ts` still signs BUY orders with `signatureType: 0`
  - `supabase/functions/prediction-sell/index.ts` still does the same for SELL
  - both still send `orderType: "GTC"`
- That still conflicts with the rest of the session model, where `polymarket-user-setup` stores proxy/safe-style fields (`safe_address`, `safe_deployed`, `approvals_set`) but submission ignores them and submits like a plain EOA flow.
- `src/pages/FightPredictions.tsx` still contains outdated “shared fallback” assumptions even though backend trading now requires a valid per-user session.

Plan

1. Confirm the exact live trade failure before editing
- Pull the latest `prediction-submit` runtime logs for the failed $1 attempt
- Inspect the newest `prediction_trade_orders` and matching `polymarket_user_sessions` records
- Identify whether the repeat failure is actually `clob_geo_blocked`, `clob_rejected`, `trading_wallet_not_ready`, or another backend/exchange error

2. Fix stale-match visibility on every public feed
- Update `src/pages/Home.tsx` to use strict filters:
  - exclude `polymarket_active = false`
  - exclude resolved/refund states, not just `settled/cancelled`
  - shorten the historical lookback window
- Update `src/pages/FightPredictions.tsx` to apply the same inactive-market filter
- Keep `locked` fights visible only inside a short grace window, not as general old inventory

3. Fix the backend lifecycle gap for closed markets
- Keep `polymarket-prices` from preserving dead market visibility
- Update `prediction-result-detect` so closed markets that do not produce a clear winner do not remain indefinitely in `open/live/locked`
- Add a fallback terminal path for unresolved closed markets so they leave browseable states

4. Align trade submission with the actual trading model
- Refactor `prediction-submit` and `prediction-sell` so order construction matches the real per-user session model
- Revisit `signatureType`, signer/funder handling, and order semantics instead of keeping the current hardcoded EOA + `GTC` path
- Keep the Fly proxy in place for now as transport, but do not treat it as the root fix by itself

5. Remove stale frontend assumptions
- In `FightPredictions.tsx`, stop proceeding as if shared backend credentials still exist
- Block submission earlier when the user session is not actually ready, instead of allowing it to fail deeper in the backend

6. Validate after implementation
- `/` should stop showing old inactive matches
- `/predictions` should hide inactive/resolved Polymarket fights except where they intentionally belong in past/history views
- A fresh $1 trade should either succeed or return one precise actionable failure that matches the backend logs

Technical details

Files most clearly involved:
- `src/pages/Home.tsx`
- `src/pages/FightPredictions.tsx`
- `supabase/functions/prediction-schedule-worker/index.ts`
- `supabase/functions/prediction-result-detect/index.ts`
- `supabase/functions/prediction-submit/index.ts`
- `supabase/functions/prediction-sell/index.ts`

Expected outcome

- Old matches disappear from public browse surfaces
- Only active or intentionally visible grace-window markets remain
- The repeated $1 failure gets traced to one confirmed root cause and fixed at the correct layer
