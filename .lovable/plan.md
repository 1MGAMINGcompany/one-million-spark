

# Fix: Backend Rejects Live/Locked Predictions + Stale Events Still Visible

## Root Cause

Three issues found:

### 1. Backend blocks all non-"open" predictions
`supabase/functions/prediction-submit/index.ts` line 29:
```
const TRADABLE_STATUSES = new Set(["open"]);
```
This means ANY fight with status "live" or "locked" is rejected at line 753 with `market_locked` — before even reaching the Polymarket validation. The frontend was updated to allow "live" and "locked+started" clicks, but the backend gate was never updated to match.

### 2. `polymarket_active = false` on all live games
The Raptors vs. Celtics game (and all 90 live fights) have `polymarket_active = false`. Even after fixing TRADABLE_STATUSES, these would still fail at line 845 with `market_inactive`. The `polymarket_active` flag is set during sync and reflects whether Polymarket considers the market open. For in-play trading, this field should NOT block submissions — the `polymarket_end_date` + grace window is the correct gate.

### 3. Old games still visible
183 fights are stuck at "locked" status. The 4-hour filter works but many are from today (started 4-6h ago). Games from yesterday/days ago with status "locked" are also still showing because the schedule-worker keeps re-processing them without settling them.

## Changes

### File 1: `supabase/functions/prediction-submit/index.ts`
**Change 1** — Add "live" and "locked" to TRADABLE_STATUSES for Polymarket-backed events:
- Keep `TRADABLE_STATUSES = new Set(["open"])` for native events
- At line 753, add a bypass: if the fight is Polymarket-backed AND status is "live" or "locked", skip the status gate (let the downstream polymarket_end_date check handle expiration)

**Change 2** — Remove the `polymarket_active === false` hard block at line 845:
- Instead, log it as a warning but don't reject
- The `polymarket_end_date` + 6h grace window is the authoritative expiration check
- This allows in-play trading on markets Polymarket marks as "started but not closed"

### File 2: `src/pages/platform/OperatorApp.tsx`
**Tighten stale event filter**: The current 4-hour window for locked events isn't aggressive enough. Additionally, filter out events where `polymarket_active === false` AND `event_date` is more than 3 hours past — these are almost certainly finished.

### File 3: No other files needed
The frontend already handles "live" and "locked+started" correctly.

## What is NOT Touched
- Payouts, claims, settlement — untouched
- Auth/JWT — untouched  
- Database schema — no migrations
- Native (non-Polymarket) event validation — unchanged
- Operator routing/themes — unchanged

## Expected Result
- Predictions succeed on live Polymarket-backed games
- Old finished games disappear from the operator app
- Backend safely rejects truly expired markets via the end_date + grace window

