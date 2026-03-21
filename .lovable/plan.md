

## Fix: Missing Soccer Events & Filter Out Past Events

### Problems Identified

1. **Missing soccer events**: The "Sync sports" button calls Gamma API with `?tag=sports`, which doesn't return all soccer markets. The Gamma API `tag` parameter is coarse — many soccer events are tagged differently (e.g., `soccer`, `football`, or just `sports`). The search shows them because it uses the `/public-search` endpoint which does full-text matching.

2. **Old/past events imported**: The sync has NO date filtering. It fetches all `active=true&closed=false` events from Gamma, which includes events whose `endDate` has already passed but whose markets haven't been formally closed by Polymarket yet. These stale events clutter the admin panel.

### Plan

#### 1. Multi-tag sync for sports (edge function)
In `polymarket-sync/index.ts`, when the tag is `"sports"`, run multiple parallel fetches for granular sub-tags: `["sports", "soccer", "football", "mma", "boxing", "nfl", "nba", "mlb", "tennis", "cricket"]`. Deduplicate results by event ID before processing. This ensures all soccer events are captured.

#### 2. Future-only date filter (edge function)
After fetching from Gamma, filter out events where `endDate` is in the past (before `now()`). Events with no `endDate` pass through (they may be perpetual markets). This prevents importing stale events.

#### 3. Auto-close past events in DB
Add a cleanup step at the end of the sync action: update any `prediction_fights` where `polymarket_end_date < NOW()` and status is still `open` to set `polymarket_active = false`. This auto-expires old events that were previously imported.

#### 4. Show date info in search results (admin UI)
In the admin search results, display the event `endDate` next to each result so the admin can see at a glance whether it's upcoming or past. Add a small "Starts in Xh" or "Ended" badge.

### Files to modify
- `supabase/functions/polymarket-sync/index.ts` — Multi-tag fetch, date filter, auto-close past
- `src/pages/FightPredictionAdmin.tsx` — Show event dates in search results

### No migration needed — only logic changes.

