

# Add `first_seen_at` Timestamp for Dwell-Time Analytics

## Overview
Add a precise timestamp column to `presence_heartbeats` so we can calculate exactly how long visitors stay. Only the analytics pipeline is touched -- no UI, no game logic, no other tables.

## Changes

### 1. Database migration
Add a `first_seen_at` column (timestamptz, default `now()`) to the `presence_heartbeats` table. Backfill existing rows using their `last_seen` value as a reasonable approximation.

```sql
ALTER TABLE presence_heartbeats
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();

UPDATE presence_heartbeats
  SET first_seen_at = last_seen
  WHERE first_seen_at IS NULL;
```

### 2. Edge function update (`supabase/functions/live-stats/index.ts`)

**Heartbeat action** -- set `first_seen_at` only on the initial INSERT (already the case via DEFAULT). The subsequent UPDATE step already skips it since it only touches `last_seen`, `page`, `game`. No change needed there.

**Stats action** -- add a new metric `avgDwellSeconds`: average of `last_seen - first_seen_at` for sessions seen in the last 10 minutes. This tells us how long current visitors have been around.

### 3. Nothing else
No UI components, no game logic, no other edge functions, no i18n files are modified.

## Files changed

| File | Change |
|------|--------|
| Migration (SQL) | Add `first_seen_at` column, backfill |
| `supabase/functions/live-stats/index.ts` | Include `first_seen_at` in INSERT; add `avgDwellSeconds` to stats response |

