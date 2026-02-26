
# Fix User Tracking: 3 Bugs Found

## Bugs Identified

### Bug 1: Page navigation is never tracked properly
The heartbeat UPDATE overwrites `page` and `game` every 30 seconds with whatever the **global** `usePresenceHeartbeat` in `AppContent` sends. Since `AppContent` always determines `page` from the URL, when a user navigates to `/play-ai/ludo`, the global heartbeat sends `page: "ai-ludo"` -- but the AI game page ALSO runs its own `useAIGameTracker` heartbeat with `page: "ai-ludo"`. Both are running with the **same session_id**, so the last one to fire wins. When the user leaves the AI game and goes back home, the global heartbeat overwrites `page` back to `"home"`, erasing the evidence they ever played.

**The real issue**: There is only ONE row per session_id. Navigation history is lost -- we only see the LAST page visited.

### Bug 2: `first_seen_at` never resets for returning visitors
The GC deletes heartbeats older than 25 hours, but `session_id` is stored in `localStorage` forever. When a user returns the next day, the INSERT silently fails (session_id exists if they visited within 25h), and the UPDATE just bumps `last_seen`. But if the GC already deleted the row, a new INSERT succeeds with today's `first_seen_at`. This means:
- Returning users within 25h: `first_seen_at` is from their FIRST EVER visit, giving inflated dwell times (e.g., 188,600 seconds = 52 hours)
- 7 sessions share the exact same `first_seen_at` of Feb 24 -- these are likely your dev/test sessions or bots that never cleared localStorage

### Bug 3: `game` column never clears when leaving a game
The UPDATE only sets `game` if it's non-null (`...(game != null ? { game } : {})`). When the user goes back to the homepage, the global heartbeat sends `game: null`, which the spread operator skips. So the `game` column is permanently "sticky" -- once set, it never clears.

## Fix Plan

### 1. Edge function: Fix heartbeat logic (supabase/functions/live-stats/index.ts)

**Reset `first_seen_at` on each new day** -- use UPSERT instead of INSERT-then-UPDATE:
- Use a single `upsert` with `onConflict: 'session_id'`
- On conflict: update `last_seen`, `page`, `game` (including nulls)
- Only reset `first_seen_at` and `first_seen_date` if `first_seen_date` is not today (new daily session)
- Always explicitly set `game` (even to null) so it clears properly

The SQL approach:
```sql
INSERT INTO presence_heartbeats (session_id, last_seen, page, game, first_seen_date, first_seen_at)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (session_id) DO UPDATE SET
  last_seen = EXCLUDED.last_seen,
  page = EXCLUDED.page,
  game = EXCLUDED.game,
  first_seen_date = CASE 
    WHEN presence_heartbeats.first_seen_date < EXCLUDED.first_seen_date 
    THEN EXCLUDED.first_seen_date 
    ELSE presence_heartbeats.first_seen_date 
  END,
  first_seen_at = CASE 
    WHEN presence_heartbeats.first_seen_date < EXCLUDED.first_seen_date 
    THEN EXCLUDED.first_seen_at 
    ELSE presence_heartbeats.first_seen_at 
  END;
```

This fixes:
- Bug 2: `first_seen_at` resets daily so dwell time is per-day, not per-lifetime
- Bug 3: `game` properly clears to null when users leave game pages

### 2. Client: Stop AI game tracker from conflicting with global heartbeat (src/hooks/useAIGameTracker.ts)

No change needed here -- the global heartbeat in `AppContent` already correctly derives `page` and `game` info from the URL. The AI game tracker's heartbeat is redundant but harmless since both send the same data. The real fix is in the edge function.

### 3. Clean up stale data

After deploying the edge function fix, the GC (25-hour window) will naturally clean old rows. The 52-hour dwell sessions will be garbage collected.

## What This Fixes
- Dwell times will be accurate per-day (not cumulative across days)
- `game` column will properly clear when users leave game pages
- "Browsing now" counts stay accurate
- The stats endpoint will report realistic `avgDwellSeconds`
