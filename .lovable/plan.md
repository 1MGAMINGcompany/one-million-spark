
# DB-Authoritative Turn Timer & Strike Tracking Implementation

## Overview

This implementation creates a fully DB-authoritative timeout and strike tracking system that fixes:
- Games stalling when a player goes offline
- Phantom forfeits from localStorage-based strike tracking
- Timer pauses in mobile wallet browsers/background tabs
- Missing `turn_timeout` moves causing invalid auto-forfeits

## Changes Summary

| Component | Change |
|-----------|--------|
| **New DB Column** | `game_sessions.missed_turns JSONB` for server-side strike tracking |
| **New RPC** | `maybe_apply_turn_timeout(room_pda)` - idempotent server-side timeout check |
| **Updated RPC** | `submit_game_move` - reset strikes on successful actions |
| **Frontend** | `BackgammonGame.tsx` - call server RPC on timeout + polling |
| **Deprecate** | `src/lib/missedTurns.ts` - no longer used for enforcement |

---

## 1. Database Migration

### 1.1 Add `missed_turns` JSONB Column

```sql
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS missed_turns JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN game_sessions.missed_turns IS 
  'Server-side strike tracking: {"wallet_address": count}. Reset on successful action.';
```

### 1.2 Create `maybe_apply_turn_timeout` RPC

This function is the core of the server-authoritative timeout system:

- **Idempotent**: Uses `FOR UPDATE` lock + deadline check to only apply once per turn
- **Validates expiry**: Only applies if `turn_started_at + turn_time_seconds < now()`
- **Records move**: Inserts `turn_timeout` move with proper hash chain
- **Updates session**: Sets `current_turn_wallet`, `turn_started_at`, clears dice state
- **Tracks strikes**: Increments `missed_turns[wallet]` 
- **Handles 3 strikes**: For 2-player games, triggers `auto_forfeit` and ends game

Key logic:
```sql
CREATE OR REPLACE FUNCTION public.maybe_apply_turn_timeout(p_room_pda TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
  -- Lock session for atomic update
  SELECT * INTO v_session FROM game_sessions WHERE room_pda = p_room_pda FOR UPDATE;
  
  -- Skip if not active, no turn holder, or already finished
  IF v_session.status_int >= 3 THEN RETURN 'not_applied'; END IF;
  
  -- Calculate deadline
  v_deadline := v_session.turn_started_at + (v_session.turn_time_seconds || ' seconds')::INTERVAL;
  IF NOW() < v_deadline - INTERVAL '2 seconds' THEN RETURN 'not_expired'; END IF;
  
  -- Apply timeout: insert move, update session, track strikes
  ...
$$;
```

### 1.3 Update `submit_game_move` to Reset Strikes

Add logic to clear a player's strike count on any successful action:

```sql
-- After successful move insertion:
IF v_move_type IN ('dice_roll', 'move', 'turn_end') THEN
  UPDATE game_sessions
  SET missed_turns = missed_turns - p_wallet
  WHERE room_pda = p_room_pda 
    AND missed_turns ? p_wallet;
END IF;
```

---

## 2. Frontend Changes

### 2.1 Update `handleTurnTimeout` in BackgammonGame.tsx

**Current behavior**: Uses `localStorage` via `incMissed()` for strike tracking

**New behavior**: Calls server-side `maybe_apply_turn_timeout` RPC

```typescript
const handleTurnTimeout = useCallback(async () => {
  if (timeoutFiredRef.current || !isActuallyMyTurn || gameOver || !roomPda) return;
  timeoutFiredRef.current = true;
  
  // Call server-side RPC instead of localStorage
  const { data, error } = await supabase.rpc("maybe_apply_turn_timeout", {
    p_room_pda: roomPda,
  });
  
  if (data?.applied) {
    if (data.type === "auto_forfeit") {
      // 3 strikes - game over
      enterOutcomeResolving(data.winnerWallet);
    } else {
      // Turn skipped - update local state from server
      setCurrentTurnWallet(data.nextTurnWallet);
      toast({ title: "Turn skipped", description: `${data.strikes}/3 missed turns` });
    }
  }
  
  timeoutFiredRef.current = false;
}, [/* deps */]);
```

### 2.2 Update Polling to Call `maybe_apply_turn_timeout`

In the polling effect (~line 750), add a call to check/apply timeout:

```typescript
// Inside pollTurnWallet, after session fetch:
if (data?.session?.status !== 'finished') {
  // Try to apply timeout if opponent is idle
  const { data: timeoutResult } = await supabase.rpc("maybe_apply_turn_timeout", {
    p_room_pda: roomPda,
  });
  
  if (timeoutResult?.applied) {
    console.log("[Polling] Server applied timeout:", timeoutResult);
    // UI will update on next poll or realtime event
  }
}
```

### 2.3 Process `turn_timeout` Moves Like `turn_end`

In `handleDurableMoveReceived` (~line 570), ensure `turn_timeout` properly clears per-turn state:

```typescript
} else if (bgMove.type === "turn_timeout") {
  // Update from server-authoritative data
  setCurrentTurnWallet(bgMove.nextTurnWallet);
  setDice([]);
  setRemainingMoves([]);
  turnTimer.resetTimer();
  timeoutFiredRef.current = false;
  
  if (isSameWallet(bgMove.nextTurnWallet, address)) {
    toast({ title: "Opponent skipped - Your turn!" });
    setGameStatus("Your turn - Roll the dice!");
  }
}
```

### 2.4 Remove localStorage Strike Tracking

Remove imports and calls to `incMissed`, `resetMissed`, `getMissed` from BackgammonGame.tsx. Keep `clearRoom` for cleanup only.

---

## 3. Multi-Player Game Support (Ludo)

The `maybe_apply_turn_timeout` RPC handles 3-4 player games differently:

```sql
IF v_session.max_players > 2 AND v_new_strikes >= 3 THEN
  -- Eliminate player instead of ending game
  UPDATE game_sessions
  SET eliminated_players = array_append(
        COALESCE(eliminated_players, '{}'), 
        v_timed_out_wallet
      ),
      current_turn_wallet = v_next_wallet,
      turn_started_at = NOW()
  WHERE room_pda = p_room_pda;
  
  -- Check if only 1 active player remains
  IF (SELECT count(*) FROM unnest(participants) 
      EXCEPT SELECT unnest(eliminated_players)) = 1 THEN
    -- Mark winner
  END IF;
END IF;
```

---

## 4. Files to Modify

| File | Changes |
|------|---------|
| `new migration .sql` | Add column, create RPC, update submit_game_move |
| `src/pages/BackgammonGame.tsx` | Update handleTurnTimeout, polling, move handler |
| `src/pages/ChessGame.tsx` | Same pattern as Backgammon |
| `src/pages/CheckersGame.tsx` | Same pattern as Backgammon |
| `src/pages/DominosGame.tsx` | Same pattern as Backgammon |
| `src/pages/LudoGame.tsx` | Same pattern + elimination logic |
| `src/lib/missedTurns.ts` | Mark as deprecated (keep for backward compat) |

---

## 5. Turn Flow After Implementation

```text
1. Timer expires on Player A's device
2. Frontend calls maybe_apply_turn_timeout(roomPda)
3. Server validates turn is actually expired
4. Server inserts turn_timeout move (atomic, idempotent)
5. Server updates current_turn_wallet = Player B
6. Server resets turn_started_at = NOW()
7. Server increments missed_turns[Player A]
8. Server returns { applied: true, nextTurnWallet: B, strikes: 1 }
9. Both devices see turn_timeout via realtime/polling
10. Player B can immediately roll dice
11. If Player A gets 3 strikes, server inserts auto_forfeit + ends game
```

---

## 6. Testing Checklist

1. Create ranked room with 10s turn timer
2. Both players enter game board immediately
3. Timer counts down visibly
4. Let timer expire → verify `turn_timeout` move in DB
5. Verify `game_sessions.current_turn_wallet` changed
6. Verify `game_sessions.missed_turns` has strike count
7. Next player can roll immediately
8. Let player time out 3 times → verify `auto_forfeit`
9. Test: Player A offline, Player B polls → timeout applied by server
10. Verify dice/remainingMoves cleared on timeout

---

## 7. Acceptance Criteria

After a timeout:
- [ ] `game_moves` contains a `turn_timeout` row
- [ ] `game_sessions.current_turn_wallet` = next player
- [ ] `game_sessions.turn_started_at` = fresh timestamp
- [ ] `game_sessions.missed_turns` shows updated strike count
- [ ] Both devices can reload `/play/:roomPda` and see correct state
- [ ] Next player can immediately roll dice
- [ ] No localStorage is used for strike enforcement
