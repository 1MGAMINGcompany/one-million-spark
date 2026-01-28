
# Fix Private Room Multiplayer Readiness + Prevent Premature Timeouts

## Problem Summary

Private rooms incorrectly bypass the `useRankedReadyGate` check because `isRankedGame` is `false` when `mode === 'private'`. The hook returns `bothReady: true` for non-ranked games, so turn timers and `useOpponentTimeoutDetection` start running even though the database shows `p2_ready=false`. This causes:

- "Turn Skipped 1/3 missed turns" notifications while UI says "Waiting..."
- Opponent cannot move because board is blocked
- Game freezes or ends incorrectly

## Root Cause Analysis

```text
useRoomMode hook:
  mode = 'private'
  isRanked = (mode === 'ranked') → FALSE
  isPrivate = (mode === 'private') → TRUE

useRankedReadyGate hook (line 326-338):
  if (!isRanked) {
    return { bothReady: true, ... }  // BYPASS - returns instantly
  }
  
Result: Private rooms get bothReady: true immediately, bypassing DB checks!
```

## Solution

Pass `isRanked: isRankedGame || isPrivate` to `useRankedReadyGate` in all 5 game files, so private rooms use the same readiness checks as ranked games.

---

## Files to Change

### 1. ChessGame.tsx (line ~407-412)

Current:
```typescript
const rankedGate = useRankedReadyGate({
  roomPda,
  myWallet: address,
  isRanked: isRankedGame,  // FALSE for private rooms
  enabled: hasTwoRealPlayers && modeLoaded,
});
```

Change to:
```typescript
// Private rooms require same ready gate as ranked
const requiresReadyGate = isRankedGame || isPrivate;

const rankedGate = useRankedReadyGate({
  roomPda,
  myWallet: address,
  isRanked: requiresReadyGate,  // TRUE for ranked AND private
  enabled: hasTwoRealPlayers && modeLoaded,
});
```

### 2. CheckersGame.tsx (line ~282-287)

Same pattern change.

### 3. BackgammonGame.tsx (line ~518-523)

Same pattern change.

### 4. DominosGame.tsx (line ~473-478)

Same pattern change.

### 5. LudoGame.tsx (line ~280-285)

Same pattern change.

---

## Verification That Gates Are Already Correct

I verified that the timer hooks and timeout handlers are already gated on `rankedGate.bothReady`:

| File | useTurnTimer.enabled | useOpponentTimeoutDetection.enabled | handleTurnTimeout |
|------|---------------------|-------------------------------------|-------------------|
| ChessGame | `shouldShowTimer && isActuallyMyTurn && rankedGate.bothReady` | `shouldShowTimer && !isActuallyMyTurn && startRoll.isFinalized && rankedGate.bothReady` | `if (!rankedGate.bothReady) return` |
| CheckersGame | Same pattern | Same pattern | Same pattern |
| BackgammonGame | Same pattern | Same pattern | Same pattern |
| DominosGame | Same pattern | Same pattern | Same pattern |
| LudoGame | Same pattern | Same pattern | Same pattern |

All hooks/callbacks already check `rankedGate.bothReady`, but the problem is that `bothReady` is always `true` for private rooms because the hook bypasses the real check.

---

## Backend Validation (Already Implemented)

The `submit_game_move` RPC function already includes GAME READY GATE validation:

```sql
-- GAME READY GATE: Reject moves/timeouts unless both players ready (for ranked/private)
IF v_session.mode IN ('ranked', 'private') THEN
  -- Reject if both players not ready
  IF NOT (
    (v_session.p1_ready = true AND v_session.p2_ready = true) OR
    v_session.start_roll_finalized = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'game_not_ready');
  END IF;
END IF;
```

This serves as a server-side safety net even if client-side bugs slip through.

---

## Why This Fix Is Safe

| Concern | Answer |
|---------|--------|
| Will casual games break? | No - `isRankedGame` and `isPrivate` are both `false` for casual, so `requiresReadyGate = false` → bypass applies correctly |
| Will ranked games break? | No - `isRankedGame = true` → `requiresReadyGate = true` → same behavior as before |
| Will private games work? | Yes - `isPrivate = true` → `requiresReadyGate = true` → proper readiness checks applied |

---

## Expected Behavior After Fix

1. Create private chess room → `p1_ready = true`
2. Player 2 joins via invite link → `set_player_ready` or `record_acceptance` sets `p2_ready = true`
3. `useRankedReadyGate` polls and sees `p1_ready && p2_ready = true`
4. `bothReady` becomes true
5. Timer display and enforcement hooks are enabled
6. Game proceeds normally with visible, synchronized timers

---

## Testing Checklist

| Scenario | Expected |
|----------|----------|
| Create private room | Timer NOT shown, no timeouts until opponent joins/accepts |
| Opponent joins private room | Both devices see synchronized countdown after acceptance |
| Make a move | Timer resets, both see new countdown |
| One player times out | Only ONE "Turn Skipped" event, turn switches correctly |
| Create casual room | No timer, bothReady = true immediately (bypass applies correctly) |
| Create ranked room | Same behavior as before (no regression) |
