

# Fix Event Time Handling, Live Trading, and Event Visibility

## Root Cause Analysis

**Problem 1 — Markets expire at game start**: `polymarket_end_date` is set to `market.endDate` from Polymarket Gamma API. For NBA/soccer games, this equals the game start time (kickoff). The `prediction-submit` edge function (line 850-856) rejects any trade where `polymarket_end_date <= now()`, so all live-game predictions fail with `market_expired`.

**Problem 2 — Frontend blocks "live" status**: `handlePredict()` (OperatorApp line 429) only allows `fight.status === "open"`. `SimplePredictionCard` also uses `isOpen = fight.status === "open"` to enable buttons. If the schedule-worker sets status to "live" or "locked", buttons become disabled and clicks are rejected.

**Problem 3 — Finished events still visible**: The DB query fetches `status IN ('open', 'live', 'locked')` which is correct, but the schedule-worker may not transition finished events to "settled" promptly. No explicit filter for `ended` live game state exists.

**Problem 4 — Silent failures**: The submission handler (line 395-404) does show toast on error, but `handlePredict` blocks before reaching submission for non-"open" statuses.

---

## Changes (6 files, all minimal and safe)

### 1. `supabase/functions/prediction-submit/index.ts` — Fix market expiration logic

**Line 850-856**: Replace the `polymarket_end_date` check with a safe fallback. If `polymarket_end_date` equals `event_date` (meaning it's just the start time), add a 6-hour grace window. Only expire if the market's `polymarket_active` is explicitly false AND `polymarket_end_date` has passed.

```
Before:
if (polymarket_end_date && new Date(polymarket_end_date) <= new Date())
  → reject "market_expired"

After:
// Determine effective close time:
// If polymarket_end_date == event_date (start time), extend by 6 hours
// Otherwise use polymarket_end_date as-is
const endDate = new Date(fight.polymarket_end_date);
const eventDate = fight.event_date ? new Date(fight.event_date) : null;
const isSameAsStart = eventDate && Math.abs(endDate.getTime() - eventDate.getTime()) < 60_000;
const effectiveClose = isSameAsStart
  ? new Date(endDate.getTime() + 6 * 3600_000)
  : endDate;

if (effectiveClose <= new Date()) {
  → reject "market_expired"
}
```

This preserves the safety check but extends the window when `endDate` equals game start time. MLB games that already have correct +7 day end dates are unaffected.

### 2. `src/pages/platform/OperatorApp.tsx` — Allow predictions on "live" status

**Line 429**: Change `handlePredict` to allow both "open" and "live" statuses:
```typescript
if (fight.status !== "open" && fight.status !== "live") {
  toast.error(t("operator.predictionsClosed"));
  return;
}
```

**Line 720**: The `FeaturedEventHero` already allows "open" or "live" — no change needed.

### 3. `src/components/operator/SimplePredictionCard.tsx` — Enable buttons for "live" status

**Line 81**: Change `isOpen` to include "live":
```typescript
const isOpen = fight.status === "open" || fight.status === "live";
```

This single change propagates to all button `disabled` and `onClick` guards.

### 4. `src/pages/platform/OperatorApp.tsx` — Hide finished events

**Line 206-215**: Add a check using live game state context to filter out ended events. The `useLiveGameState` hook can't be called per-fight in a filter, so instead add a post-filter in the rendering layer.

Actually, the DB query already filters to `status IN ('open', 'live', 'locked')` — settled/finished events won't appear. The real issue is events that are "locked" but the game ended. The schedule-worker handles transitioning these.

For immediate UX improvement, add a client-side filter in `enrichedFights` that hides events where `status` is "locked" AND `event_date` is more than 6 hours ago (safety net for slow settlement):

```typescript
// In allFights filter, add:
if (f.status === "locked" && d.getTime() < Date.now() - 6 * 3600_000) return false;
```

### 5. `src/pages/platform/OperatorApp.tsx` — Better error messages for closed markets

**Line 421-422**: Enhance the catch block to show specific error messages:
```typescript
catch (err: any) {
  const msg = err.message || "";
  if (msg.includes("expired") || msg.includes("closed")) {
    toast.error(t("operator.marketClosed", "This market has closed"));
  } else if (msg.includes("started")) {
    toast.error(t("operator.eventFinished", "This event has finished"));
  } else {
    toast.error(t("operator.predictionFailed"), { description: msg });
  }
}
```

### 6. `src/i18n/locales/en.json` — Add new error keys

Add:
```json
"operator.marketClosed": "This market has closed",
"operator.eventFinished": "This event has finished — predictions are no longer available"
```

Add equivalent translations to all 10 locale files.

---

## What is NOT touched (safety)

| Area | Status |
|---|---|
| Payouts / claims / settlement | Untouched |
| `prediction-claim` edge function | Untouched |
| `prediction-auto-settle` | Untouched |
| Audit logging | Preserved (all audit calls remain) |
| Auth / Privy / JWT | Untouched |
| Database schema | No migrations |
| Operator routing / theme | Untouched |
| `polymarket-sync` ingestion | Untouched (data stays as-is) |

## Live game data display

Already implemented in previous build — `LiveGameBadge` and `LiveScoreDisplay` components are active on all card variants and the featured hero. The `useSportsWebSocket` hook provides real-time scores via WebSocket + 30s REST fallback. No additional changes needed.

## Files to modify

| File | Change |
|---|---|
| `supabase/functions/prediction-submit/index.ts` | Fix `polymarket_end_date` expiration with 6h grace when end_date equals start time |
| `src/pages/platform/OperatorApp.tsx` | Allow "live" in `handlePredict`; hide stale locked events; better error messages |
| `src/components/operator/SimplePredictionCard.tsx` | `isOpen` includes "live" status |
| `src/i18n/locales/*.json` (10 files) | Add `marketClosed` and `eventFinished` keys |

