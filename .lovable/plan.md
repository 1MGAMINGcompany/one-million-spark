

# Fix: Prediction Failing with "event_already_started"

## Root Cause

Your prediction on **Golden Knights vs. Oilers** failed because of an overly strict event-date guard in the `prediction-submit` edge function.

The fight's `event_date` is `2026-04-05 02:00:00 UTC`. You tried to predict at `03:51 UTC` — almost 2 hours after the event start time. The backend code (line 779-784) checks:

```
if (eventStart <= Date.now()) → reject with "event_already_started"
```

This is wrong for Polymarket-backed events. On Polymarket, markets stay open during live games (that's the whole point of in-play trading). The `polymarket_end_date` and `polymarket_active` checks already handle market closure for PM events. The event-date guard should only apply to native (non-Polymarket) events.

## The Fix

**File: `supabase/functions/prediction-submit/index.ts` (lines ~770-798)**

Wrap the event-date guard and sibling-locked check in a condition that skips them for Polymarket-backed events:

```typescript
// EVENT DATE GUARD — only for native (non-Polymarket) events
// Polymarket manages its own market lifecycle; their markets
// intentionally stay open during live games for in-play trading.
if (fight.event_id && !isPolymarketBacked) {
  // ... existing event_date check ...
  // ... existing sibling locked check ...
}
```

However, there's a sequencing problem: `isPolymarketBacked` is computed on line 818, AFTER the event-date guard on line 772. So we need to either:
- Move the `isPolymarketBacked` computation earlier (before the guard), or
- Use a simpler inline check: `fight.polymarket_market_id && fight.polymarket_outcome_a_token`

The simplest fix is to add the polymarket check inline:

```typescript
const hasPolymarketRouting = !!(fight.polymarket_market_id && fight.polymarket_outcome_a_token);

if (fight.event_id && !hasPolymarketRouting) {
  // existing event_date and sibling checks stay as-is
}
```

## What This Changes

- Polymarket-backed events: The event-date guard is skipped. Market open/close is governed by `polymarket_active`, `polymarket_end_date`, and `status` checks (which already exist).
- Native events: The event-date guard continues to work exactly as before.
- No other changes to payments, auth, fee collection, or any other part of the flow.

## Scope

- **1 file edited**: `supabase/functions/prediction-submit/index.ts`
- **No database changes**
- **No frontend changes**
- Edge function auto-deploys on save

