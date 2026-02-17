

## Fix: `game_already_finished` After Room Replay

### Root Cause
`submit_game_move` rejects moves when `game_over_at IS NOT NULL`, but `ensure_game_session` never clears `game_over_at` or `winner_wallet` when recycling a finished room. Additionally, `maybe_apply_turn_timeout` only checks `status_int`, so it keeps firing timeouts on recycled rooms where `game_over_at` is still set.

### Migration: 3 Changes

#### 1. Update `ensure_game_session` (5-param overload) -- recycling block

In the `IF existing_status = 'finished'` branch, add the missing resets:

```sql
UPDATE game_sessions SET
  game_type = p_game_type,
  game_state = '{}'::jsonb,
  player1_wallet = p_player1_wallet,
  player2_wallet = p_player2_wallet,
  mode = p_mode,
  start_roll_finalized = false,
  starting_player_wallet = NULL,
  start_roll = NULL,
  start_roll_seed = NULL,
  current_turn_wallet = NULL,
  p1_ready = false,
  p2_ready = false,
  status = 'waiting',
  status_int = 1,              -- ADD: was missing
  game_over_at = NULL,         -- ADD: the bug
  winner_wallet = NULL,        -- ADD: the bug
  missed_turns = '{}'::jsonb,  -- ADD: clear strike counts
  eliminated_players = '{}'::text[], -- ADD: clear eliminations
  waiting_started_at = NULL,   -- ADD: fresh waiting timer
  turn_started_at = NULL,      -- ADD: no stale turn clock
  p1_acceptance_tx = NULL,     -- ADD: fresh acceptance cycle
  p2_acceptance_tx = NULL,     -- ADD: fresh acceptance cycle
  participants = ARRAY[p_player1_wallet], -- ADD: reset to creator only
  updated_at = now()
WHERE room_pda = p_room_pda;
```

#### 2. Update `ensure_game_session` (7-param overload) -- ON CONFLICT path

Add reset logic to the `ON CONFLICT DO UPDATE` clause so that when a finished room gets a new `ensure_game_session` call, stale fields are cleared:

```sql
-- Add to ON CONFLICT DO UPDATE SET:
game_over_at = CASE
  WHEN game_sessions.status_int = 3 THEN NULL
  ELSE game_sessions.game_over_at
END,
winner_wallet = CASE
  WHEN game_sessions.status_int = 3 THEN NULL
  ELSE game_sessions.winner_wallet
END,
missed_turns = CASE
  WHEN game_sessions.status_int = 3 THEN '{}'::jsonb
  ELSE game_sessions.missed_turns
END,
eliminated_players = CASE
  WHEN game_sessions.status_int = 3 THEN '{}'::text[]
  ELSE game_sessions.eliminated_players
END,
```

#### 3. Update `maybe_apply_turn_timeout` -- add `game_over_at` guard

After the existing `status_int >= 3` check, add:

```sql
-- Right after: IF v_session.status_int >= 3 THEN ...
IF v_session.game_over_at IS NOT NULL THEN
  RETURN jsonb_build_object('applied', false, 'reason', 'game_over_at_set');
END IF;
```

#### 4. One-time backfill (safety net)

```sql
UPDATE game_sessions
SET game_over_at = NULL,
    winner_wallet = NULL,
    missed_turns = '{}'::jsonb
WHERE status_int IN (1, 2)
  AND (game_over_at IS NOT NULL OR winner_wallet IS NOT NULL);
```

Currently 0 rows match (verified via query), but this guards against any future race.

### What Does NOT Change
- `submit_game_move` -- its `game_over_at IS NOT NULL` check is correct and stays as-is
- `finish_game_session` -- untouched
- `maybe_apply_waiting_timeout` -- untouched
- All on-chain logic -- untouched
- All edge functions -- untouched

### Verification Checklist
1. Create room, play to completion (status_int=3, game_over_at set), then replay/reset via ensure_game_session -- confirm game_over_at is NULL and dice_roll + moves succeed
2. Confirm `maybe_apply_turn_timeout` returns `game_over_at_set` and does NOT insert strikes when game_over_at is still set
3. Confirm a truly finished game (status_int=3) still blocks moves with `game_already_finished`
4. Confirm the backfill updates 0 rows (no currently broken sessions)

### Files Modified
- Single database migration containing all 3 function replacements + backfill UPDATE

