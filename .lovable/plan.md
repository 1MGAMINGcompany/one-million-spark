

# Prediction System Audit Results

## What's Working
- Routes wired correctly (`/predictions`, `/predictions/admin`)
- Database schema: `prediction_events`, `prediction_fights` (with all new columns), `prediction_entries`, `prediction_admins` — all in place with correct RLS
- Realtime enabled on `prediction_fights` and `prediction_entries`
- Edge functions: `prediction-admin`, `prediction-submit`, `prediction-claim`, `prediction-feed` — all deployed with `verify_jwt = false`
- Admin UI: full lifecycle buttons (lock → live → select winner → method → confirm → settle → draw → refund)
- FightCard: all status badges mapped correctly
- Event grouping working in both admin and public pages
- Safety dialogs on irreversible actions
- Claim function accepts `confirmed` and `settled` status (line 50 of prediction-claim)
- Draw/refund flow separated correctly in `prediction-admin`

## Issues Found

### 1. `prediction-refund-worker` missing from `config.toml`
The edge function file exists at `supabase/functions/prediction-refund-worker/index.ts` but there's no `[functions.prediction-refund-worker]` entry in `config.toml`. Without this, the function won't deploy and the admin "Process Refunds" button will fail.

**Fix:** Add `[functions.prediction-refund-worker]` with `verify_jwt = false` to config.toml.

### 2. `prediction-claim` still accepts old `"resolved"` status
Line 50: `["resolved", "confirmed", "settled"]` — but `resolved` is no longer a valid status in the new lifecycle. Should be `["confirmed", "settled"]` only.

**Fix:** Remove `"resolved"` from the allowed statuses.

### 3. Missing `prediction_update_pool` RPC function
`prediction-submit` calls `supabase.rpc("prediction_update_pool", ...)` on line 130. This function doesn't exist in any migration. The fallback direct update on line 138 works but has a race condition — two concurrent predictions could read the same pool value and one would overwrite the other.

**Fix:** Create a `prediction_update_pool` database function that uses atomic increment.

### 4. `useSolPrice` failing — CoinGecko blocked in preview
Console shows repeated `TypeError: Failed to fetch` from `useSolPrice.ts`. The CoinGecko API is being blocked (likely by the preview sandbox's fetch proxy). This spams errors every 30 seconds per component instance.

**Fix:** Proxy the price fetch through a backend function, or add error suppression so it doesn't spam logs. Not critical for core functionality — USD values just won't show.

### 5. Seed data not in migration
The plan called for seeding Silvertooth + 3 test events with fights. The migration only created the schema — no INSERT statements. Events and fights need to be created manually through the admin panel, or a seed migration should be added.

**Action needed from you:** Create events and fights through the admin panel at `/predictions/admin`.

---

## What You Need To Do

1. **Nothing code-wise** — I'll fix issues #1-3 in implementation.
2. **For issue #4 (USD prices):** This is a preview-environment limitation. It will work on your published domain. No action needed.
3. **For issue #5 (seed data):** Go to `/predictions/admin` and create your events + fights there. Or I can add a seed migration — your call.
4. **Verify your payout wallet** has SOL funded for claims/refunds (the `VERIFIER_SECRET_KEY_V2` wallet).

## Implementation Plan

| Task | Details |
|------|---------|
| Add `prediction-refund-worker` to config.toml | Add the missing function config entry |
| Fix prediction-claim status check | Remove `"resolved"`, keep only `["confirmed", "settled"]` |
| Create `prediction_update_pool` DB function | Atomic increment to prevent race conditions on concurrent predictions |

