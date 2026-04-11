
Goal: stop the churn, identify exactly what works vs. what is broken, compare against last night’s stable behavior, and fix only the smallest set of files needed so a fresh user session can place a real $1 prediction and live games show LIVE/score/time/period again.

What I confirmed
- This is not a React crash/runtime-error problem.
- The operator sign-out control is already present now in `src/pages/platform/OperatorApp.tsx`.
- The browser is already on the official Polymarket SDK path in `src/lib/clobOrderClient.ts`.
- The current SDK call is still likely malformed: `createAndPostMarketOrder(...)` is being called without the documented `price` field, even though Polymarket docs show market orders still need a worst-price limit.
- For EOA mode, the client is also initialized with `funder = undefined`, while Polymarket quickstart shows signature type `0` with `funder = signer.address`.
- Live data is currently unreliable for two concrete reasons:
  1. `src/hooks/useSportsWebSocket.tsx` opens `wss://sports-api.polymarket.com/ws` but sends no subscribe payload.
  2. The snapshot fallback exists, but it has not been proven to return data for the exact slugs currently rendered.

Do I know what the issue is?
- Order path: mostly yes. The strongest concrete bug is the current SDK call shape in `clobOrderClient.ts` (missing `price`, likely wrong EOA `funder`, weak error diagnostics).
- Live-game path: partially yes. The architecture is wrong today (non-subscribing WS + unverified snapshot), but I would still compare against last night’s file versions before changing it again.

Plan
1. Freeze scope and compare against last night
- Use History to inspect only:
  - `src/lib/clobOrderClient.ts`
  - `src/hooks/useSportsWebSocket.tsx`
  - `supabase/functions/live-game-state/index.ts`
  - `supabase/functions/prediction-submit/index.ts`
  - `src/pages/platform/OperatorApp.tsx`
- Keep the clearly good changes already made: logout button, per-user trading session flow, SDK direction.

2. Build a hard “works / doesn’t / unknown” matrix before editing
- Works: login/logout UI, prediction modal, backend preflight reaching `client_submit`, credential save path.
- Broken: actual exchange acceptance, LIVE badge + score + period + clock.
- Unknown: whether sports snapshot returns current slug data, whether sports WS needs an explicit subscription handshake.

3. Stabilize the order path without reverting to manual JSON
- Keep the official SDK as the single source of truth.
- In `src/lib/clobOrderClient.ts`:
  - pass the documented `price` into `createAndPostMarketOrder`
  - use correct EOA funder semantics for signature type `0`
  - keep `negRisk` and FOK/FAK handling aligned to docs
  - enable richer SDK/API errors so the next test returns exact HTTP status and response snippet
- In `supabase/functions/prediction-submit/index.ts`, keep only the order params the browser truly needs so there is no stale duplicate order-builder logic.

4. Restore live-game data in a controlled way
- Treat snapshot as source 1 and websocket as source 2.
- First verify `live-game-state` against current slugs; if it is wrong, fix that before touching UI.
- Then repair `useSportsWebSocket.tsx`:
  - compare with last night’s version
  - add/restore the correct subscription behavior if required
  - keep slug-first matching
  - log requested slugs, returned snapshot slugs, and first unmatched WS messages
- Leave `OperatorApp.tsx` and `SimplePredictionCard.tsx` reading one merged live-state source only.

5. Validate with one conclusive test, not many retries
- One fresh sign-out/sign-in
- One fresh $1 prediction
- One known live game check
- Record:
  - signatureType
  - funder
  - price
  - negRisk
  - orderType
  - `/order` HTTP status
  - response body snippet
  - snapshot requested slug count vs. returned slug count
  - whether LIVE data came from snapshot, websocket, or both

6. Rollback rule
- If last night’s version of a specific file was clearly better, revert only that file and then reapply the smallest safe fix.
- Do not do a full-project rollback, because that could reintroduce earlier auth/session regressions.

Technical details
- Shared trading helper used by both operator and flagship flows: `src/lib/clobOrderClient.ts`
- Likely order-fix files: `src/lib/clobOrderClient.ts`, `supabase/functions/prediction-submit/index.ts`
- Likely live-data files: `src/hooks/useSportsWebSocket.tsx`, `supabase/functions/live-game-state/index.ts`, `src/pages/platform/OperatorApp.tsx`, `src/components/operator/SimplePredictionCard.tsx`
- Good reference already in repo: `src/hooks/usePolymarketLivePrices.ts` does send an explicit websocket subscribe payload on open; the sports live hook currently does not.

Expected outcome
- We stop stacking speculative changes.
- We produce an exact “what works / what doesn’t” list.
- We either restore last night’s known-good live behavior or replace it with a verified snapshot+WS flow.
- We make the next order test conclusive instead of another vague `Invalid order payload`.
