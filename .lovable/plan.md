

# Fix: Live Game Data, Missing Events, and Stale Visibility on Operator App

## Root Cause Analysis

Three distinct problems found:

### Problem 1 — Pacers vs Cavaliers (and other games) not in DB
The `polymarket-sync` worker imports events from Polymarket's Gamma API. Today's NBA games that ARE in the DB were imported during previous sync runs. The Pacers vs Cavaliers game for today simply was **never imported** — it doesn't exist in `prediction_fights` at all. This is a sync coverage gap, not a display bug. The sync worker may not have run recently, or the event may have been filtered out during import.

### Problem 2 — Games stuck at "locked" status, never become "live"
All of today's started games (NBA, Soccer, NHL) are stuck at `status = 'locked'`. The `prediction-schedule-worker` transitions `locked → live` only when `scheduled_live_at` is set and has passed. **But `scheduled_live_at` is NULL for every event checked.** The sync worker is not populating `scheduled_live_at` during import, so no game ever transitions to "live" status automatically.

Since games never reach `status = 'live'`:
- `LiveGameBadge` never shows score/period data on cards (the badge IS wired up and works — it just needs a `polymarket_slug` and the game to be visible)
- The previous fix allowing `status === "live"` for predictions has no effect because nothing reaches that status
- Cards for started games show as disabled (locked = not open/live)

### Problem 3 — Old/finished games still visible
The filter hides locked games only after 6 hours past `event_date`. Games that started 1-3 hours ago are still visible but grayed out (locked + disabled buttons). This creates the appearance of stale content.

## Proposed Changes

### 1. Fix `polymarket-sync` — Set `scheduled_live_at` during import
**File: `supabase/functions/polymarket-sync/index.ts`**

When upserting events, set `scheduled_live_at = event_date` (game start time) so the schedule-worker can transition fights from `locked` to `live` when the game starts.

Also set `scheduled_lock_at = event_date - 5 minutes` if not already set, so games get locked just before kickoff.

### 2. Fix `prediction-schedule-worker` — Backfill NULL `scheduled_live_at`
**File: `supabase/functions/prediction-schedule-worker/index.ts`**

Add a Phase 0 at the top: for any `prediction_events` with `status = 'approved'` and `scheduled_live_at IS NULL` and `event_date <= now()`, auto-set `scheduled_live_at = event_date` and immediately transition locked fights to live. This fixes all existing stuck events.

### 3. Fix client-side visibility — Show locked games as tradeable if in-play
**File: `src/pages/platform/OperatorApp.tsx`**

The `handlePredict` gate currently allows `open` and `live`. Also allow `locked` for Polymarket-backed events where `event_date` has passed (game has started). This enables in-play trading even when the schedule-worker hasn't caught up.

```typescript
// In handlePredict:
const isStarted = (fight as any).event_date && new Date((fight as any).event_date).getTime() < Date.now();
const isPolymarket = !!(fight as any).polymarket_slug;
if (fight.status !== "open" && fight.status !== "live" && !(fight.status === "locked" && isStarted && isPolymarket)) {
  toast.error(t("operator.marketClosed"));
  return;
}
```

### 4. Fix `SimplePredictionCard` — Enable buttons for locked+started Polymarket events
**File: `src/components/operator/SimplePredictionCard.tsx`**

Update `isOpen` logic to match:
```typescript
const isStarted = (fight as any).event_date && new Date((fight as any).event_date).getTime() < Date.now();
const isPolymarket = !!(fight as any).polymarket_slug;
const isOpen = fight.status === "open" || fight.status === "live" || (fight.status === "locked" && isStarted && isPolymarket);
```

### 5. Hide truly finished events more aggressively
**File: `src/pages/platform/OperatorApp.tsx`**

For locked events where `event_date` is more than **4 hours** ago (reduced from 6h), hide from view. For events where live game data confirms `ended = true`, hide immediately.

Add a filter using the `SportsWSContext` games map:
```typescript
// In allFights filter:
if (f.status === "locked" && d.getTime() < Date.now() - 4 * 3600_000) return false;
```

### 6. Trigger a sync run to import missing games
After deploying, manually invoke `polymarket-sync` to import today's missing NBA games (Pacers vs Cavaliers, etc.).

## Files to Modify

| File | Change |
|---|---|
| `supabase/functions/polymarket-sync/index.ts` | Set `scheduled_lock_at` and `scheduled_live_at` from `event_date` during upsert |
| `supabase/functions/prediction-schedule-worker/index.ts` | Backfill NULL `scheduled_live_at` for started events; auto-transition to live |
| `src/pages/platform/OperatorApp.tsx` | Allow locked+started Polymarket events for predictions; tighten finished-event filter to 4h |
| `src/components/operator/SimplePredictionCard.tsx` | Enable buttons for locked+started Polymarket events |

## What is NOT Touched
- Payouts, claims, settlement logic
- Auth / Privy / JWT
- Database schema (no migrations)
- Edge function: `prediction-submit` (already has 6h grace window)
- Theme system, routing, operator config

## Expected Result
- Games transition to `live` status when `event_date` passes
- LiveGameBadge shows real scores/periods/clock from Polymarket Sports API
- Predictions work during live games (even if status is still `locked`)
- Finished games disappear after 4 hours (or immediately when live data confirms ended)
- Missing games appear after next sync run

