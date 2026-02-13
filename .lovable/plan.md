

# Fix Three Pre-Existing Bugs

These bugs existed before our Ludo changes. None were introduced by the player count selector.

## Bug 1: MatchShareCard Loading Forever

**Cause**: In `MatchShareCard.tsx` line 38, a `return` statement (cleanup function) executes before the async data fetch on line 43. The fetch is unreachable dead code.

**Fix**: Move the cleanup `return` to the end of the useEffect, after the async IIFE.

### File: `src/pages/MatchShareCard.tsx`

Restructure the useEffect so the async fetch runs, and cleanup is returned at the end.

---

## Bug 2: Ranked/Casual Mode Mismatch on Room List

**Cause**: Room list infers mode from `entryFeeSol > 0` instead of using the DB `mode` field. The `game-sessions-list` edge function already returns `mode` -- it's just not mapped.

**Fix**: Map `mode` from enrichment data onto room objects, use it for the badge.

### File: `src/pages/RoomList.tsx`

- Add `mode` to the enrichment mapping
- Change badge logic to use `room.mode === 'ranked'` with fallback to stake inference

---

## Bug 3: Zombie Rooms Never Expire

**Cause**: Rooms created before the `waiting_started_at` feature have NULL values, so the 120-second timeout never triggers.

**Fix**: One-time database cleanup to cancel stale rooms (older than 24 hours, no opponent joined). Also backfill `waiting_started_at` from `created_at` in the timeout RPC as a fallback (this already exists in the `maybe_apply_waiting_timeout` function -- it backfills from `created_at` -- but the function only runs during `game-session-get` polling, and nobody polls dead rooms).

### Database migration

```sql
UPDATE game_sessions
SET status = 'cancelled', status_int = 5, game_over_at = now(), updated_at = now()
WHERE status_int IN (1, 2)
  AND created_at < now() - interval '24 hours'
  AND (player2_wallet IS NULL OR winner_wallet IS NULL);
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/MatchShareCard.tsx` | Move cleanup return to end of useEffect so fetch is reachable |
| `src/pages/RoomList.tsx` | Map `mode` from enrichment data; use DB mode for badge |
| Database | One-time cleanup of zombie rooms older than 24 hours |

## Room Expiry Reference

| Scenario | Timeout |
|----------|---------|
| Waiting room (1 participant) | 120 seconds after `waiting_started_at` |
| Active game turn timeout | 3 missed turns triggers auto-forfeit |
| Rooms with NULL `waiting_started_at` | Never (the bug -- fixed by cleanup) |

