# Fix: Block Double Dice Roll in Backgammon (Backend + Frontend)

## Status: ✅ COMPLETED

## Overview
This fix addressed the bug where a player was prompted to roll dice twice in a row. The solution includes both a backend guard to reject duplicate rolls and a frontend fix to prevent the UI from incorrectly resetting dice state.

---

## Part 1: Backend Guard — Block Multiple `dice_roll` Per Turn ✅

### Target
`submit_game_move` PostgreSQL RPC (SQL migration)

### Change Applied
Added a guard that rejects `dice_roll` if the player already rolled during their current turn:
- Find last `turn_end` by ANOTHER player (not me)
- Check if I already rolled since that `turn_end`
- Returns `{ success: false, error: 'already_rolled' }` if duplicate detected

---

## Part 2: Frontend Fix — Don't Clear Dice When Turn Arrives ✅

### Target
`src/pages/BackgammonGame.tsx` — polling and visibility change handlers

### Change Applied
Modified polling logic to only clear dice when turn changes **away from** the player:
- Compute `wasMyTurn` and `isNowMyTurn`
- Only clear `dice`, `remainingMoves`, `selectedPoint`, `validMoves` when `wasMyTurn && !isNowMyTurn`
- Only prompt "Roll the dice!" if `dice.length === 0`

---

## Files Changed

| File | Change |
|------|--------|
| `submit_game_move` RPC | Added `already_rolled` guard (migration applied) |
| `src/pages/BackgammonGame.tsx` | Fixed polling logic (lines 854-906, 929-965) |

---

## Expected Behavior After Fix

1. Player A ends turn → turn changes to Player B
2. Player B rolls dice → dice state set locally
3. Polling fires → sees turn is Player B's → does NOT clear dice
4. Backend ensures only one `dice_roll` per turn is allowed
