

## Fix: Past Events Showing in "Today" Section

### Problem
Events like "Jake Paul vs Gervonta" (Nov 15) and "Floyd Mayweather" (Jun 5) appear in the "Today" section with a "Started" label. This happens because:

1. Their fights still have `status: "open"` in the database — the auto-close logic only targets fights with `polymarket_end_date` set, which these older events lack.
2. The categorization logic (line 247 of `FightPredictions.tsx`) routes any event with open fights into "today", regardless of how old the event is.

### Plan

#### 1. Fix categorization to exclude old events from "today"
In `src/pages/FightPredictions.tsx`, add a check: if the event date is more than 24 hours in the past AND is not on today's calendar day, route it to `past` regardless of whether it has open fights. This prevents months-old events from appearing in "today".

#### 2. Broader auto-close in polymarket-sync
In the sync cleanup step, also close fights where the parent event's `event_date` is more than 48 hours in the past and status is still `open`. This catches events that lack `polymarket_end_date`.

#### 3. One-time DB cleanup
Run a SQL update to set `status = 'cancelled'` on fights whose `event_date` is more than 48 hours in the past and are still `open`. This immediately removes the stale events.

### Files to modify
- `src/pages/FightPredictions.tsx` — Add past-date guard to categorization logic
- `supabase/functions/polymarket-sync/index.ts` — Broaden auto-close to use `event_date` fallback

