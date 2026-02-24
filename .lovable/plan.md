

# Fix: 24h Visitor Count Drops to Zero at Midnight UTC

## Problem

The garbage collector (GC) in `live-stats` deletes all heartbeat rows from previous calendar days (`first_seen_date < todayDate`). But the visitor count queries rows from the last 24 rolling hours (`last_seen >= 24h ago`). At midnight UTC, GC wipes yesterday's rows, so the 24h count crashes from ~800 to near zero.

Right now the table only has 29 rows, all from after midnight UTC today -- confirming the bug.

## Fix

Change the GC filter from "delete rows from previous days" to "delete rows older than 24 hours". This preserves all rows the 24h visitor query needs.

### File: `supabase/functions/live-stats/index.ts` (lines 142-149)

**Before:**
```typescript
// Garbage collect old heartbeats (older than 15 min) — but ONLY from previous days.
// Today's rows must be preserved so "visitors today" count never drops mid-day.
const gcCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
await supabase
  .from("presence_heartbeats")
  .delete()
  .lt("last_seen", gcCutoff)
  .lt("first_seen_date", todayDate);
```

**After:**
```typescript
// Garbage collect heartbeats older than 25 hours (keeps full 24h rolling window intact).
const gcCutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
await supabase
  .from("presence_heartbeats")
  .delete()
  .lt("last_seen", gcCutoff);
```

The 25-hour buffer (instead of exactly 24h) prevents edge-case race conditions where a row is deleted just as the stats query reads it.

No other files need to change. The `first_seen_date` column becomes unused by GC but is harmless to keep.

