

## Plan: Fix Stale Events Showing + Prediction Submission Failures

### Root Cause Analysis

**Two separate but related issues:**

**Issue 1: UFC event shows "OPEN" + Predict buttons despite being over**
- The UFC Mason Jones event has `event_date: 2026-03-22T03:59:59.999+00:00` — this is the Polymarket market *end date*, not the actual event start time.
- The real UFC card started hours earlier. The `eventHasStarted` check in EventSection (line 140) compares `event_date` to `Date.now()`, but since the date is still slightly in the future, fights with DB status `open` still show Predict buttons.
- The polymarket-prices worker already locked some fights (detected extreme prices), but prop bets like "Jones to win by KO/TKO?" remain `open` in the DB because their Polymarket prices haven't resolved yet.
- **Fix needed:** Client-side needs a smarter "started" check. If *any* fight in the event is already `locked` or `live`, the event has started and remaining `open` fights should show as locked too. Additionally, the backend submit should reject trades on events where the majority of fights are already locked/live.

**Issue 2: Futbol prediction submission fails silently**
- The futbol fights ("Real Sociedad de Fútbol B", "Granada CF", "Draw") are structured as separate Yes/No fights — not as a single A-vs-B fight.
- `fighter_a_name: "Yes"`, `fighter_b_name: "No"`. When the user picks "Yes" on "Real Sociedad de Fútbol B", the fight card sends `fighter_pick: "fighter_a"` to `handlePredict`.
- DB confirms: `status: open`, `trading_allowed: true`. The backend should accept this.
- No console logs or network requests appeared, meaning the failure is *before* `handleSubmit` is called. The most likely cause: after clicking Predict, the PredictionModal opens, but either:
  - (a) The `wallet` prop is null (Privy EVM wallet not resolved), so clicking Predict triggers `onWalletRequired` instead of `onPredict`
  - (b) The modal opens but the user sees an error during the allowance/preflight step
- Since the user says they're logged in and have USDC, the issue is likely (a): the `wallet` value (EVM address from `usePrivyWallet`) isn't resolving. The FightCard checks `wallet ? onPredict(fight, "fighter_a") : onWalletRequired?.()` — if `wallet` is falsy, it silently opens the wallet gate instead of submitting.

### Fixes (3 changes)

**1. Fix `eventHasStarted` detection — use sibling fight statuses**
- File: `src/components/predictions/EventSection.tsx`
- Change `eventHasStarted` logic: if any fight in the event group has status `locked` or `live`, treat the entire event as started. This prevents showing Predict buttons on remaining `open` fights when the event is clearly underway.
- Current: `const eventHasStarted = event?.event_date ? new Date(event.event_date).getTime() <= Date.now() : false;`
- New: Also check `fights.some(f => f.status === "locked" || f.status === "live")` as an additional signal.

**2. Fix FightCard silent wallet gate redirect**
- File: `src/components/predictions/FightCard.tsx`
- The predict button checks `wallet ? onPredict(...) : onWalletRequired?.()`. When the wallet gate triggers instead of the predict flow, the user sees no error — it just opens a modal they don't expect.
- Add a toast when `onWalletRequired` fires from a Predict button click: "Wallet not connected — please connect your wallet to predict."
- Also pass `onPredict` directly and let `handlePredict` in FightPredictions.tsx handle the wallet check (it already does on lines 530-537). Remove the duplicate wallet check from FightCard.

**3. Add backend guard for events that have started**
- File: `supabase/functions/prediction-submit/index.ts`
- After the fight status check, add a cross-check: look up the event's `event_date` and if it's in the past, reject the trade even if the individual fight is still `open`. This prevents edge cases where the polymarket-prices worker hasn't locked all fights yet.

### Files to edit
1. `src/components/predictions/EventSection.tsx` — Improve `eventHasStarted` to check sibling fight statuses
2. `src/components/predictions/FightCard.tsx` — Remove duplicate wallet gating, let parent handle auth
3. `supabase/functions/prediction-submit/index.ts` — Add event_date guard to reject trades on started events

