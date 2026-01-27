
# Fix Private Room Mode: Database Constraint & Complete Implementation

## Root Cause Analysis

The edge function logs reveal the critical issue:

```
ERROR [game-session-set-settings] insert error {
  code: "23514",
  message: 'new row for relation "game_sessions" violates check constraint "game_sessions_mode_check"'
}
```

**The database has a CHECK constraint that only allows `'casual'` and `'ranked'`** - NOT `'private'`. When the edge function tries to INSERT a new session with `mode='private'`, it fails silently, causing:

1. Private room appearing in public room list (mode never saved → defaults to showing)
2. Mode badge showing "Ranked" instead of "Private" (0.004 SOL stake = ranked detection)
3. Share dialog not opening (roomMode stays 'casual', button condition fails)
4. Turn time showing 1m instead of 10s (session not created → no turn_time_seconds)

---

## Technical Solution

### Fix 1: Update Database Constraint (Migration)

**Action:** Add a database migration to modify the CHECK constraint to include 'private':

```sql
-- Drop the old constraint
ALTER TABLE game_sessions DROP CONSTRAINT game_sessions_mode_check;

-- Add new constraint that includes 'private'
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_mode_check 
  CHECK (mode = ANY (ARRAY['casual'::text, 'ranked'::text, 'private'::text]));
```

### Fix 2: Update `upsert_game_session` RPC (Database Function)

The `upsert_game_session` function at line 5 of the DB functions also has hardcoded mode validation:
```sql
IF p_mode NOT IN ('casual', 'ranked') THEN
  RAISE EXCEPTION 'Invalid mode';
END IF;
```

This needs to be updated to include 'private':
```sql
IF p_mode NOT IN ('casual', 'ranked', 'private') THEN
  RAISE EXCEPTION 'Invalid mode';
END IF;
```

### Fix 3: Update `ensure_game_session` RPC (Database Function)

Similarly, the `ensure_game_session` function has:
```sql
IF p_mode NOT IN ('casual', 'ranked') THEN
  RAISE EXCEPTION 'Invalid mode';
END IF;
```

Update to:
```sql
IF p_mode NOT IN ('casual', 'ranked', 'private') THEN
  RAISE EXCEPTION 'Invalid mode';
END IF;
```

---

## Implementation Summary

| Component | Change |
|-----------|--------|
| Database Migration | Drop and recreate `game_sessions_mode_check` constraint to include 'private' |
| `upsert_game_session` RPC | Add 'private' to mode validation |
| `ensure_game_session` RPC | Add 'private' to mode validation |

---

## Expected Results After Fix

1. **Private rooms saved correctly** - INSERT succeeds with `mode='private'`
2. **Private rooms hidden** - `activeSessionsMap.get(room.pda)?.mode === 'private'` filters them out
3. **Share dialog opens** - `roomMode === 'private'` condition passes
4. **Turn time displays correctly** - Session row exists with `turn_time_seconds = 10`
5. **Mode badge shows "Private"** - DB returns `mode='private'` to Room.tsx

---

## Verification Steps

After migration:
1. Create a private Chess room with 10s turn time and 0.004 SOL stake
2. Verify: Room does NOT appear in public room list on other devices
3. Verify: Share dialog auto-opens on creator's device
4. Verify: "Share Invite Link" button visible on room page
5. Verify: Turn time shows 10s in Share dialog
