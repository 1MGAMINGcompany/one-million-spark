
Issue identified:
- The demo prediction exists for the wallet in your screenshot.
- Lightning vs. Sabres already has `winner = fighter_b`, `confirmed_at`, and `claims_open_at` in the database, but its current `status` is still `live`.
- That means the new My Picks UI is not the problem. The card component only shows the payout/result state when the fight is `confirmed`, `settled`, or `result_selected`.
- Root cause: `prediction-result-detect` confirms the fight correctly, then `prediction-schedule-worker` keeps forcing the same event back to `live` every minute. That breaks the payout pipeline and keeps the card stuck on the generic “Your Pick” view.
- The balance is not changing because no payout has actually been sent yet. The balance hooks already poll every 15s.

Plan

1. Stop the scheduler from reviving resolved fights
- File: `supabase/functions/prediction-schedule-worker/index.ts`
- Fix the blanket `status: "live"` updates at:
  - lines 73-79
  - lines 186-191
  - lines 243-248
- Only transition fights to `live` if they are truly unresolved:
  - `winner IS NULL`
  - `confirmed_at IS NULL`
  - `settled_at IS NULL`
  - status is still `open`/`locked`
- Also tighten stale-live diagnostics so already resolved fights are not treated as active events.

2. Add self-healing for fights already corrupted
- File: `supabase/functions/prediction-schedule-worker/index.ts`
- Add an early repair phase before normal scheduling:
  - if a fight is `open`/`locked`/`live` but already has `winner` or `confirmed_at`
    - restore it to `confirmed` if `claims_open_at` is still in the future
    - restore it to `settled` if `claims_open_at` has already passed
- This will repair Lightning vs. Sabres and any other fights that were already overwritten.

3. Make the result/settlement pipeline resilient
- Files:
  - `supabase/functions/prediction-result-detect/index.ts`
  - `supabase/functions/prediction-auto-settle/index.ts`
- `prediction-result-detect` currently scans only fights where `winner IS NULL` (lines 229-237), so corrupted rows are skipped forever.
- Add a recovery path so fights with a stored winner but bad unresolved status can be normalized instead of ignored.
- Keep `prediction-auto-settle` focused on confirmed fights, but ensure repaired rows can flow into settlement immediately.

4. Improve My Picks refresh behavior
- File: `src/pages/platform/OperatorApp.tsx`
- Replace the manual `loadUserEntries()` state flow with a query-based refetch strategy, or add timed/on-focus refetches for:
  - `prediction_entries`
  - `picksFights`
- This makes backend changes show up in the demo app without relying on multiple manual refresh attempts.

5. Keep the existing My Picks result UI
- File: `src/components/operator/SimplePredictionCard.tsx`
- No major redesign needed.
- The result/claim UI already exists at:
  - lines 86-88
  - lines 146-199
- After the status bug is fixed, the same card should automatically show:
  - winner
  - won/lost state
  - collect winnings button
  - claimed state

Technical details
- Frontend is already wired correctly:
  - `src/pages/platform/OperatorApp.tsx:213-227` fetches My Picks fights independently
  - `src/pages/platform/OperatorApp.tsx:348-355` bypasses browse filters for My Picks
  - `src/pages/platform/OperatorApp.tsx:869-883` passes the user entry into the card
- Balance display is not the main bug:
  - `src/hooks/usePolygonUSDC.ts` already polls every 15s
  - `src/components/operator/OperatorBalanceBanner.tsx` also polls the EOA every 15s
- The real blocker is backend state corruption:
  - `supabase/functions/prediction-result-detect/index.ts` correctly set the Lightning vs. Sabres winner
  - `supabase/functions/prediction-schedule-worker/index.ts` then repeatedly changed the fight back to `live`

Expected outcome
- Lightning vs. Sabres will stop bouncing back to `live`.
- The demo account’s My Picks card will switch into the resolved state.
- The user will see the correct win/loss result and, if still needed, a claim path.
- Once payout actually runs, the balance banner should reflect it normally.