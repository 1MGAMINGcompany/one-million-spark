
# Comprehensive Fix: Game Sync Flow

## Current Status: Why It's Broken

The game flow is broken due to a **missing trigger mechanism**. Here's the chain of failure:

```text
1. Creator creates room → record_acceptance called → sets p1_ready=true ✓
2. Joiner joins room → record_acceptance called → sets p2_ready=true ✓
3. BUT: maybe_finalize_start_state is NEVER called
4. AND: participants array is NEVER populated
5. RESULT: start_roll_finalized stays false forever
6. RESULT: Game board never renders, stuck on "Waiting for opponent"
```

## Root Causes

### Cause 1: `participants` Array Never Populated
The `record_acceptance` function updates `p1_ready`/`p2_ready` flags and `player1_wallet`/`player2_wallet`, but does NOT update the `participants` array. The migration we created expects this array to be filled.

### Cause 2: `maybe_finalize_start_state` Never Called
There's no trigger, no direct call from `record_acceptance`, and no other mechanism that invokes this function after both players are ready.

### Cause 3: Logic Gap in Recent Migration
The new `maybe_finalize_start_state` function checks `participants` array first, but since nothing populates it, the condition `v_participants_count < v_required_count` is always true, so it returns early.

## Solution: Fix `record_acceptance` to Auto-Start Game

The cleanest fix is to make `record_acceptance` do TWO things when the joiner (non-creator) records acceptance:

1. **Populate `participants` array** from `player1_wallet` and `player2_wallet`
2. **Call `maybe_finalize_start_state`** directly to auto-start the game

This creates a clean trigger chain:
```text
Joiner records acceptance → participants populated → maybe_finalize called → game starts
```

## Implementation Details

### Database Migration: Update `record_acceptance` Function

```sql
CREATE OR REPLACE FUNCTION public.record_acceptance(
  p_room_pda text,
  p_wallet text,
  p_tx_signature text,
  p_rules_hash text,
  p_stake_lamports bigint,
  p_is_creator boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_nonce TEXT;
  v_session RECORD;
BEGIN
  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '4 hours';
  v_nonce := encode(extensions.gen_random_bytes(16), 'hex');
  
  -- Update game_sessions ready flags
  IF p_is_creator THEN
    UPDATE game_sessions
    SET p1_acceptance_tx = p_tx_signature,
        p1_ready = TRUE,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    -- Joiner: set p2_ready AND populate participants array
    UPDATE game_sessions
    SET p2_acceptance_tx = p_tx_signature,
        p2_ready = TRUE,
        player2_wallet = p_wallet,
        -- CRITICAL: Populate participants array for maybe_finalize_start_state
        participants = ARRAY[player1_wallet, p_wallet],
        updated_at = NOW()
    WHERE room_pda = p_room_pda
    RETURNING * INTO v_session;
    
    -- If both players now ready, auto-start the game
    IF v_session.p1_ready AND v_session.p2_ready THEN
      PERFORM maybe_finalize_start_state(p_room_pda);
    END IF;
  END IF;
  
  -- Insert into game_acceptances table
  INSERT INTO game_acceptances (
    room_pda, player_wallet, rules_hash, signature, session_token, nonce,
    timestamp_ms, session_expires_at
  ) VALUES (
    p_room_pda, p_wallet, p_rules_hash, p_tx_signature, v_session_token, v_nonce,
    EXTRACT(EPOCH FROM NOW())::bigint * 1000, v_expires_at
  )
  ON CONFLICT (room_pda, player_wallet) DO UPDATE SET
    signature = EXCLUDED.signature,
    session_token = EXCLUDED.session_token,
    session_expires_at = EXCLUDED.session_expires_at,
    created_at = NOW();
  
  -- Update player_sessions
  INSERT INTO player_sessions (room_pda, wallet, session_token, rules_hash, last_turn, last_hash)
  VALUES (p_room_pda, p_wallet, v_session_token, p_rules_hash, 0, NULL)
  ON CONFLICT (room_pda, wallet) 
  DO UPDATE SET 
    session_token = v_session_token,
    rules_hash = p_rules_hash,
    revoked = FALSE,
    last_move_at = NOW();
  
  RETURN jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at
  );
END;
$$;
```

Key changes:
1. When joiner calls `record_acceptance`, also set `participants = ARRAY[player1_wallet, p_wallet]`
2. After updating, check if `p1_ready AND p2_ready`, if so call `maybe_finalize_start_state`
3. This creates the missing trigger that starts the game

### Frontend: No Changes Needed
The existing `RulesGate` and game page logic already correctly handles `start_roll_finalized`. Once the database properly sets this flag, the UI will automatically transition to the game board.

## Why This Will Work

| Step | Before Fix | After Fix |
|------|------------|-----------|
| Creator creates room | p1_ready=true, participants=[] | p1_ready=true, participants=[] |
| Joiner joins room | p2_ready=true, participants=[] | p2_ready=true, participants=[p1,p2] |
| Auto-start check | Never happens | maybe_finalize_start_state called |
| start_roll_finalized | Stays false | Set to true |
| Game board renders | Stuck on "Waiting" | Board shows ✓ |

## Edge Function Status

The `solana-rpc-read` edge function IS working (confirmed by logs showing successful `getProgramAccounts` calls). The "Failed to Load Rooms" error was a temporary deployment issue that has been resolved. The rooms will load correctly once refreshed.

## Files to Modify

| File | Changes |
|------|---------|
| New migration | Update `record_acceptance` to populate `participants` and call `maybe_finalize_start_state` |

## Testing Checklist

After implementing:
1. Refresh the Room List page - should load rooms
2. Create a new ranked room with 10s turn timer
3. Have another wallet join the room
4. Both devices should transition to game board within 2-3 seconds
5. Turn timer should display and count down
6. First player (creator) should be able to move immediately

## Turn Timer Display in Room List

The turn timer IS already shown in the Room List dropdown (lines 466-470 show `Clock` icon with `{room.turnTimeSec}s`). If it shows "—", it means:
- The `game_sessions` row doesn't exist yet (room just created)
- Or `turn_time_seconds` is null/0 in the session

The `game-session-set-settings` edge function already saves this during room creation. This should work correctly once the game flow is fixed.
