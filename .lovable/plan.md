
# Fix: Clear Dice on Turn Arrival (Polling Fallback Bug)

## Root Cause Analysis

When realtime fails and only polling syncs the turn, the dice state is **not cleared** when the turn arrives. This causes the roll button to be hidden even though it's the player's turn.

### Bug Sequence

1. During opponent's turn, player receives `dice_roll` via realtime → `dice = [4, 1]` (opponent's values)
2. Opponent plays moves and ends turn  
3. Realtime fails for `turn_end` event (common in wallet in-app browsers)
4. Polling fires → detects turn change → turn is now ARRIVING to player
5. Current code (line 896): `if (wasMyTurn && !isNowMyTurn)` → condition is FALSE
6. Dice are NOT cleared → `dice = [4, 1]` still stored (opponent's old dice)
7. Button condition: `isMyTurn && dice.length === 0` → `true && false` = FALSE
8. **No roll button appears!**
9. Player times out (turn_timeout fires)

### Evidence from Database

```
Turn 10: dice_roll [4, 1] by Fbk1 (creator)
Turn 11-12: moves by Fbk1
Turn 13: turn_end by Fbk1 → turn passes to BSBA (joiner)
Turn 14: turn_timeout by BSBA ← Joiner never rolled!
```

The joiner's client likely had `dice = [4, 1]` (stale from creator's roll) when polling detected the turn change, causing the button to hide.

---

## Solution

When the turn **arrives** to the player (opponent ended their turn), we must also clear the dice state. The opponent's dice values have no meaning for the new turn-holder.

### File: `src/pages/BackgammonGame.tsx`

**Change 1: Polling handler (around line 894)**

```typescript
// Always clear dice and remainingMoves on any turn change
// - When leaving my turn: clear my dice (I just used them)
// - When arriving to my turn: clear opponent's dice (stale from their roll)
setDice([]);
setRemainingMoves([]);

// Only clear selection/validMoves when turn LEAVES me
if (wasMyTurn && !isNowMyTurn) {
  setSelectedPoint(null);
  setValidMoves([]);
}
```

**Change 2: Visibility handler (around line 954)**

Apply the same fix:

```typescript
// Always clear dice and remainingMoves on any turn change
setDice([]);
setRemainingMoves([]);

// Only clear selection/validMoves when turn LEAVES me
if (wasMyTurn && !isNowMyTurn) {
  setSelectedPoint(null);
  setValidMoves([]);
}
```

---

## Why This Fix is Safe

- When it's my turn arriving, the dice should always be empty (I haven't rolled yet)
- When it's my turn leaving, my dice are consumed and should be cleared
- The opponent's dice in my local state are meaningless to me
- This matches the behavior in `handleDurableMoveReceived` which always calls `setDice([])` on `turn_end`

---

## Summary of Changes

| Location | Before | After |
|----------|--------|-------|
| Polling (line 896) | Only clear dice when `wasMyTurn && !isNowMyTurn` | Always clear dice on any turn change |
| Visibility (line 955) | Only clear dice when `wasMyTurn && !isNowMyTurn` | Always clear dice on any turn change |

This ensures the roll button appears correctly even when realtime fails and only polling syncs the turn state.
