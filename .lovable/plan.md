
# Fix: Visitors Today Count Drops Mid-Day

## Root Cause

The "visitors today" count drops because the garbage collection (GC) logic in the `live-stats` edge function deletes ALL presence heartbeat rows older than 15 minutes — including today's visitors who simply left the site.

**Broken code (line 141-143 in `supabase/functions/live-stats/index.ts`):**
```ts
const gcCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
await supabase.from("presence_heartbeats").delete().lt("last_seen", gcCutoff);
```

This permanently removes any session not seen in the last 15 minutes. Since "visitors today" is counted by querying `presence_heartbeats` for rows with `first_seen_date = today`, deleted rows disappear from the count permanently.

**Example of what happened:**
- 09:00 — User A visits → count = 1
- 09:30 — User A leaves (tab closed, no heartbeat for 15+ min)
- 09:31 — Next `stats` call triggers GC → User A's row deleted → count = 0

## The Fix: One Line

Add a second filter to the GC delete so it only removes rows from **previous days**, never today's:

```ts
// BEFORE (broken):
await supabase.from("presence_heartbeats").delete().lt("last_seen", gcCutoff);

// AFTER (fixed):
await supabase
  .from("presence_heartbeats")
  .delete()
  .lt("last_seen", gcCutoff)
  .lt("first_seen_date", todayDate);  // ← only deletes past-day stale sessions
```

`todayDate` is already computed earlier in the same code block (`"YYYY-MM-DD"` string), so no new variables are needed.

## What Changes

| File | Change |
|------|--------|
| `supabase/functions/live-stats/index.ts` | Add `.lt("first_seen_date", todayDate)` to GC delete query (1 line) |

## Behaviour After Fix

- Users who visited today and left will stay in the `presence_heartbeats` table until midnight
- The "visitors today" count only ever goes **up** throughout the day — never down
- "Browsing now" (last 10 min) is unaffected and still reflects live users accurately
- The table still gets cleaned of old multi-day stale sessions to prevent unbounded growth
- No schema changes, no new tables — purely a logic fix in the edge function
