

## Database Migration: Fix Ranked Multiplayer Deadlock

### Problem
Ranked multiplayer games deadlock at "waiting for player 2" because `player2_wallet` is never set when the second player accepts rules via `set_player_ready` RPC.

### Solution
Update the `set_player_ready` PostgreSQL RPC to atomically populate `player2_wallet` when:
- The slot is currently NULL
- The accepting wallet is not player1
- This mirrors the behavior in `record_acceptance` RPC

### SQL Migration

```sql
CREATE OR REPLACE FUNCTION public.set_player_ready(
  p_room_pda text,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p1 text;
  v_p2 text;
BEGIN
  SELECT player1_wallet, player2_wallet
    INTO v_p1, v_p2
  FROM public.game_sessions
  WHERE room_pda = p_room_pda;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game session not found';
  END IF;

  -- Player 1 ready
  IF p_wallet = v_p1 THEN
    UPDATE public.game_sessions
    SET p1_ready = true,
        updated_at = now()
    WHERE room_pda = p_room_pda;
    RETURN;
  END IF;

  -- Player 2 ready (normal case)
  IF v_p2 IS NOT NULL AND p_wallet = v_p2 THEN
    UPDATE public.game_sessions
    SET p2_ready = true,
        updated_at = now()
    WHERE room_pda = p_room_pda;
    RETURN;
  END IF;

  -- NEW: If p2 slot is empty, claim it atomically
  IF v_p2 IS NULL AND p_wallet <> v_p1 THEN
    UPDATE public.game_sessions
    SET player2_wallet = p_wallet,
        p2_ready = true,
        updated_at = now()
    WHERE room_pda = p_room_pda
      AND player2_wallet IS NULL;

    IF FOUND THEN
      RETURN;
    END IF;

    -- Handle race: if another process filled p2 concurrently
    SELECT player2_wallet INTO v_p2
    FROM public.game_sessions
    WHERE room_pda = p_room_pda;

    IF v_p2 IS NOT NULL AND p_wallet = v_p2 THEN
      UPDATE public.game_sessions
      SET p2_ready = true,
          updated_at = now()
      WHERE room_pda = p_room_pda;
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'wallet not in game';
END;
$$;
```

### Key Changes from Current RPC

| Current Behavior | New Behavior |
|------------------|--------------|
| Only matches existing p1/p2 wallets | Also handles empty p2 slot |
| Fails if p2_wallet is NULL | Atomically claims p2 slot |
| No race condition handling | Re-checks if concurrent process filled slot |

### Race Condition Handling
The new code handles the edge case where two processes try to claim p2 simultaneously:
1. First UPDATE uses `WHERE player2_wallet IS NULL` for atomicity
2. If UPDATE doesn't find a row (another process won), re-fetch and check if we're now p2
3. If so, just set p2_ready = true

### Expected Flow After Fix

```text
Player 2 accepts rules
    ↓
ranked-accept calls set_player_ready(room, p2_wallet)
    ↓
RPC checks: p2_wallet = NULL? YES
    ↓
Atomically sets: player2_wallet = p_wallet, p2_ready = true
    ↓
compute_start_roll sees both players → SUCCESS
    ↓
Game starts with dice roll
```

### What This Fixes
- Chess, Backgammon, Checkers, Dominos ranked multiplayer
- "Waiting for player 2" deadlock
- compute_start_roll failures
- Turn timer not starting

### Explicitly NOT Changed
- Ludo (uses different 2-4 player logic)
- Auto-forfeit logic
- Payout/escrow logic
- Dice roll logic
- Any frontend files

### Frontend Changes Required
None - existing flow will work once RPC is updated.

