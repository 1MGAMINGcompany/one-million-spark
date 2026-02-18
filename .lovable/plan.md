

# Fix: Free Match Mode Check Constraint

## Problem
The `game_sessions` table has a CHECK constraint that only allows `mode` values: `'casual'`, `'ranked'`, `'private'`. The `free-match` edge function inserts `mode = 'free'`, which the database rejects with error `game_sessions_mode_check`.

## Solution

Two changes needed:

### 1. Database Migration
Add `'free'` to the allowed values in the CHECK constraint:

```sql
ALTER TABLE game_sessions DROP CONSTRAINT game_sessions_mode_check;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_mode_check
  CHECK (mode = ANY (ARRAY['casual', 'ranked', 'private', 'free']));
```

### 2. Update Database Functions
The following functions validate mode and need `'free'` added to their allowed values:
- `upsert_game_session` -- has `IF p_mode NOT IN ('casual', 'ranked', 'private')`
- `ensure_game_session` (both overloads) -- has `IF p_mode NOT IN ('casual', 'ranked', 'private')`

Each needs `'free'` appended to the allowed list.

## Files
| Item | Action |
|------|--------|
| DB migration (CHECK constraint) | Add `'free'` to allowed modes |
| DB functions (`upsert_game_session`, `ensure_game_session`) | Add `'free'` to mode validation |

No frontend changes needed -- the edge function and QuickMatch code already use `mode = 'free'` correctly.

