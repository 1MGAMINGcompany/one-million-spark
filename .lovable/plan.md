

# Fix: Block Double Dice Roll in Backgammon (Backend + Frontend)

## Overview
This fix addresses the bug where a player is prompted to roll dice twice in a row. The solution requires both a backend guard to reject duplicate rolls and a frontend fix to prevent the UI from incorrectly resetting dice state.

---

## Part 1: Backend Guard — Block Multiple `dice_roll` Per Turn

### Target
`submit_game_move` PostgreSQL RPC (SQL migration)

### Current Issue
The RPC guards against moves after `turn_end`, but does NOT prevent a player from submitting multiple `dice_roll` moves before making any moves or ending their turn.

### Logic
A `dice_roll` should be rejected if the player already rolled during their current turn. The "current turn" is defined as all moves since the last `turn_end` that passed turn away from this player.

### SQL Migration

```sql
-- Block duplicate dice_roll per turn in Backgammon
-- A player cannot roll dice more than once before their turn_end

CREATE OR REPLACE FUNCTION public.submit_game_move(
  p_room_pda TEXT,
  p_wallet TEXT,
  p_move_data JSONB,
  p_client_move_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_last_move RECORD;
  v_move_type TEXT;
  -- ... (existing variables)
  v_last_turn_end_other INTEGER;
BEGIN
  -- ... (existing session lock + game over check + ready gate)

  v_move_type := p_move_data->>'type';

  -- ... (existing turn_end guard)

  -- =======================================================
  -- NEW: Block duplicate dice_roll within same turn
  -- =======================================================
  IF v_move_type = 'dice_roll' THEN
    -- Find the last turn_end by ANOTHER player (not me)
    SELECT COALESCE(MAX(turn_number), 0) INTO v_last_turn_end_other
    FROM game_moves
    WHERE room_pda = p_room_pda
      AND (move_data->>'type') = 'turn_end'
      AND wallet != p_wallet;
    
    -- Check if I already rolled since that turn_end
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda
        AND wallet = p_wallet
        AND (move_data->>'type') = 'dice_roll'
        AND turn_number > v_last_turn_end_other
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_rolled');
    END IF;
  END IF;
  -- =======================================================

  -- ... (rest of existing function unchanged)
END;
$$;
```

### Key Points
- Returns `{ success: false, error: 'already_rolled' }` if duplicate detected
- Uses indexed `turn_number` column for fast lookup
- Does not affect other move types

---

## Part 2: Frontend Fix — Don't Clear Dice When Turn Arrives

### Target
`src/pages/BackgammonGame.tsx` — polling and visibility change handlers

### Current Bug (Lines 854-906)
When polling detects a turn wallet change, it always clears `dice`, `remainingMoves`, and selection. This causes issues when:
1. Opponent ends turn → turn changes to me
2. I roll dice immediately
3. Polling fires → sees turn changed → clears my dice
4. UI shows "Roll the dice!" again

### Fix Logic
Only clear per-turn state when the turn changes **away from** the player, not when it changes **to** them.

### Code Changes

**Polling handler (lines 854-906):**

```typescript
if (freshTurnWallet && freshTurnWallet !== currentTurnWallet) {
  console.log("[BackgammonGame] Polling detected turn change:", {
    from: currentTurnWallet?.slice(0, 8),
    to: freshTurnWallet.slice(0, 8),
  });
  
  // Compute turn direction
  const wasMyTurn = currentTurnWallet && isSameWallet(currentTurnWallet, address);
  const isNowMyTurn = isSameWallet(freshTurnWallet, address);
  
  // Always update turn wallet and reset timer
  setCurrentTurnWallet(freshTurnWallet);
  timeoutFiredRef.current = false;
  turnTimer.resetTimer();
  
  // Only clear per-turn state when turn LEAVES me
  if (wasMyTurn && !isNowMyTurn) {
    setDice([]);
    setRemainingMoves([]);
    setSelectedPoint(null);
    setValidMoves([]);
  }
  
  // Update status appropriately
  if (isNowMyTurn) {
    // Only prompt to roll if we don't already have dice
    if (dice.length === 0) {
      setGameStatus("Your turn - Roll the dice!");
    }
  } else {
    setGameStatus("Opponent's turn");
  }
  
  // ... (keep existing timeout notification logic)
}
```

**Visibility change handler (lines 926-957):**

Apply the same logic:

```typescript
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    supabase.functions.invoke("game-session-get", {
      body: { roomPda },
    }).then(({ data }) => {
      const dbTurnWallet = data?.session?.current_turn_wallet;
      if (dbTurnWallet && dbTurnWallet !== currentTurnWallet) {
        const wasMyTurn = currentTurnWallet && isSameWallet(currentTurnWallet, address);
        const isNowMyTurn = isSameWallet(dbTurnWallet, address);
        
        setCurrentTurnWallet(dbTurnWallet);
        timeoutFiredRef.current = false;
        
        // Only clear dice when turn leaves me
        if (wasMyTurn && !isNowMyTurn) {
          setDice([]);
          setRemainingMoves([]);
          setSelectedPoint(null);
          setValidMoves([]);
        }
        
        // Only show roll prompt if no dice exist
        if (isNowMyTurn && dice.length === 0) {
          setGameStatus("Your turn - Roll the dice!");
        } else if (!isNowMyTurn) {
          setGameStatus("Opponent's turn");
        }
      }
    }).catch(err => {
      console.warn("[BackgammonGame] Visibility poll error:", err);
    });
  }
};
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| New Migration | Add `already_rolled` guard to `submit_game_move` RPC |
| `src/pages/BackgammonGame.tsx` | Fix polling logic to only clear dice when turn leaves player |

---

## Defense in Depth

Both fixes work together:
- **Frontend fix** prevents the UI from incorrectly prompting double rolls
- **Backend fix** rejects invalid `dice_roll` moves even if client bugs exist

This follows the existing "server-authoritative" architecture pattern.

---

## Expected Behavior After Fix

1. Player A ends turn → turn changes to Player B
2. Player B rolls dice → dice state set locally
3. Polling fires → sees turn is Player B's → does NOT clear dice
4. Backend ensures only one `dice_roll` per turn is allowed

