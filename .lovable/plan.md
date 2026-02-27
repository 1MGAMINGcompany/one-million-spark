

# Fix Page Navigation Tracking: Add Visit Log

## Problem
The current heartbeat system only stores the **last page** a user was on. When a user navigates home -> play-ai -> chess -> home, you only see "home". This is why it looks like nobody goes anywhere -- they do, but the data gets overwritten every 30 seconds.

The 2 non-home entries in the last 24 hours are users whose session *ended* while on those pages.

## Solution: Add a `page_visits` table

Instead of overwriting the `page` column, log every page change as a separate row. This gives you a complete navigation timeline for every session.

### 1. New database table: `page_visits`

```text
page_visits
-----------
id              uuid (PK, auto)
session_id      text (not null)
page            text (not null)
game            text (nullable)
entered_at      timestamptz (default now())
```

- RLS: `deny_all_clients` (same pattern as `presence_heartbeats`)
- Garbage collection: delete rows older than 7 days (done in the stats action)

### 2. Update `usePresenceHeartbeat` hook

Track the previous page in a ref. When `page` changes, fire a one-time `page_visit` action to the edge function. The regular heartbeat continues unchanged.

```text
prevPage ref = null
on page change:
  -> call live-stats with action: "page_visit"
  -> prevPage = page
```

### 3. Update `live-stats` edge function

Add a new `page_visit` action handler:
- Validate `sessionId` and `page`
- Insert into `page_visits` table
- Add GC step: delete `page_visits` older than 7 days (runs on `stats` action)

### 4. Update `stats` action to return page flow data

Add a query to the stats action that returns page visit distribution for the last N hours, so you can see which pages users actually navigate to:

```text
SELECT page, count(*) FROM page_visits
WHERE entered_at > now() - interval '24 hours'
GROUP BY page ORDER BY count DESC
```

## Technical Details

- The heartbeat `page` column continues to work as before (shows current page)
- `page_visits` is append-only, giving full journey data
- No changes to existing heartbeat logic -- this is purely additive
- GC keeps the table from growing unbounded (7-day retention)
- Same security model: deny all client access, service role only

## What You'll See After This

Instead of "293 home, 1 play-ai, 1 quick-match", you'll see something like:
- home: 295 visits
- play-ai: 45 visits  
- ai-chess: 12 visits
- quick-match: 8 visits
- game-rules: 5 visits

Every page a user touches gets logged with a timestamp, so you can also reconstruct individual user journeys.
