

## Fix: Prevent "Roll Dice Again" After Connection Drop

### Problem
When `4aTbb`'s connection dropped mid-turn, the reconnect handler cleared the dice state, showing the "Roll Dice" button again. The player re-rolled, getting different dice values. This happened twice in the same game (turns 12-13 and 22-23). This corrupts the game state because the original moves based on the first roll become orphaned.

### Root Cause (Two Missing Guards)

1. **Server**: `submit_game_move` has no backgammon-specific guard against a second `dice_roll` in the same turn. Chess/Checkers/Dominos auto-flip turns so this can't happen, but Backgammon allows multi-move turns.

2. **Client**: The polling reconnect handler (line 902) sets `diceRolledThisTurnRef.current = false` then immediately checks it (line 911) to decide whether to clear dice. This always evaluates to "clear dice" -- a logic error.

### Fix 1: Server-Side Double Roll Guard (Database Migration)

Add a guard in `submit_game_move` for backgammon `dice_roll` type moves. Before inserting, check if the last move for this room by the current turn wallet is already a `dice_roll` with no `turn_end` since:

```sql
-- Inside submit_game_move, after the existing turn_already_ended check:
-- Backgammon double-roll guard: reject second dice_roll in same turn
IF v_move_type = 'dice_roll'
   AND (v_game_type_lower = 'backgammon' OR v_session.game_type = '3')
THEN
  IF EXISTS (
    SELECT 1 FROM game_moves
    WHERE room_pda = p_room_pda
      AND wallet = p_wallet
      AND (move_data->>'type') = 'dice_roll'
      AND turn_number > COALESCE(
        (SELECT MAX(turn_number) FROM game_moves
         WHERE room_pda = p_room_pda
           AND (move_data->>'type') = 'turn_end'),
        0
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_rolled');
  END IF;
END IF;
```

This ensures the server never accepts a second dice roll in the same backgammon turn, regardless of client state.

### Fix 2: Client-Side Reconnect Dice Restoration (BackgammonGame.tsx)

**2a. Fix the ref reset logic bug (line 902/911):**

Currently at line 902, `diceRolledThisTurnRef.current` is set to `false`, then at line 911 it checks `if (!diceRolledThisTurnRef.current)` which is always true. The ref reset should happen AFTER the dice clearing decision, not before.

Move the `diceRolledThisTurnRef.current = false` to AFTER the dice clearing block, and only if the turn actually changed away from the player.

**2b. On reconnect, restore dice from DB instead of clearing:**

When polling detects it's still the same player's turn, fetch the last move. If it's a `dice_roll`, restore those dice values instead of clearing them. This prevents the "Roll Dice" button from reappearing.

In the polling handler (~line 860-925), when the turn wallet hasn't changed but we're reconnecting:
- Query the last move for this room
- If the last move is `dice_roll` by the current turn wallet, restore `dice` and `remainingMoves` from that move's data
- Set `diceRolledThisTurnRef.current = true`

**2c. Handle `already_rolled` response silently:**

In the `persistMove` / durable sync error handling, when the server returns `already_rolled`, don't show an error toast. Instead, silently refresh the dice state from the server's accepted roll.

### Fix 3: WebRTC Reconnect Handler (same pattern, line ~1444)

Apply the same `diceRolledThisTurnRef` guard fix to the WebRTC `turn_end` handler to prevent clearing dice that were already rolled.

### What Does NOT Change
- `rollDice` function itself (its `dice.length > 0` guard is correct)
- On-chain logic
- Other game types (Chess, Checkers, Dominos auto-flip turns so this can't happen)
- Ludo (uses separate engine)
- Settlement / forfeit logic

### Files Modified
1. **Database migration** -- Update `submit_game_move` with backgammon double-roll guard
2. **src/pages/BackgammonGame.tsx** -- Fix reconnect dice restoration and ref reset ordering

### Verification Checklist
1. Play a backgammon game, simulate connection drop mid-turn (toggle airplane mode), verify dice are NOT cleared on reconnect
2. Verify server rejects a second `dice_roll` with `already_rolled` (test via curl or intentional double-submit)
3. Verify normal gameplay flow still works: roll -> move -> end turn -> opponent rolls
4. Verify `already_rolled` response does NOT show error toast to user

### Match Card Note
The match card for this room exists at the URL you shared but was NOT found in the `match_share_cards` database table. This suggests the match card page may be rendering data from `game_sessions` + `settlement_logs` directly rather than from `match_share_cards`. This is a separate investigation if needed.
