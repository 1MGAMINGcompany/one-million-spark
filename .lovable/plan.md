
# Fix: Stop Clearing Valid Dice During Session Restore (Backgammon)

## Problem
Backgammon multiplayer incorrectly clears `dice` and `remainingMoves` mid-turn after a move is persisted. This especially breaks doubles (where you get 4 moves), because after making 1 move and persisting, the session restore handler treats the existing dice as "stale" and clears them.

## Root Cause
Lines 438-441 in `src/pages/BackgammonGame.tsx`:
```typescript
if (isRestoredToMyTurn && persisted.dice?.length > 0) {
  console.log("[BackgammonGame] Clearing stale dice on session restore - it's my turn but dice exist");
  setDice([]);
  setRemainingMoves([]);
}
```

This logic is **backwards**. If it's my turn and I have dice, those are **valid** dice from my current turn (I rolled and am mid-move). The restore happens after every move persistence, so this was wiping valid dice.

## Solution
Remove the clearing behavior entirely. Always restore dice/remainingMoves from persisted state:

**Before (buggy):**
```typescript
if (isRestoredToMyTurn && persisted.dice?.length > 0) {
  console.log("[BackgammonGame] Clearing stale dice on session restore - it's my turn but dice exist");
  setDice([]);
  setRemainingMoves([]);
} else {
  setDice(persisted.dice || []);
  setRemainingMoves(persisted.remainingMoves || []);
}
```

**After (fixed):**
```typescript
// Always restore dice from persisted state
// Turn-based clearing is handled by polling/realtime handlers on actual turn change
setDice(persisted.dice ?? []);
setRemainingMoves(persisted.remainingMoves ?? []);
```

## Why This is Safe
- Persisted state IS the truth during a turn
- Turn-based clearing is already handled correctly by:
  - `turn_end` / `turn_timeout` move handlers
  - Polling handler when `current_turn_wallet` changes
  - Visibility handler when `current_turn_wallet` changes
- The restore handler should just restore, not make clearing decisions

## File Changes

| File | Lines | Change |
|------|-------|--------|
| `src/pages/BackgammonGame.tsx` | 433-445 | Remove conditional dice clearing, always restore from persisted |

## What We're NOT Changing
- Polling logic (already correctly clears on turn change)
- Visibility handler (already correctly clears on turn change)
- No debounce/timers added
- No database changes

## Expected Behavior After Fix
1. Roll doubles [4,4] → remainingMoves = [4,4,4,4]
2. Make move → remainingMoves = [4,4,4] 
3. Move persists → realtime fires → restore PRESERVES dice = [4,4]
4. Make second move → remainingMoves = [4,4]
5. Continue until all 4 moves complete
6. Turn ends properly when remainingMoves = []
