

# Fix Double-Roll Bug + Share Page Not Loading

## Problem 1: Double-Roll Dice Bug (Backgammon)

**Root cause:** When you roll the dice, your roll sets `dice` state. But polling (every 5 seconds) and WebRTC sync fire almost immediately after, and the guards at lines 899-903 and 1430-1432 use `dice.length` from stale React state (due to batching). This means the sync clears your dice right after you rolled, forcing you to roll again.

**Fix:** Add a `useRef` called `diceRolledThisTurnRef` that is set to `true` in `rollDice()` and reset to `false` only when the turn wallet genuinely changes. The polling and WebRTC sync handlers will check this ref (which is always current, unlike state) before clearing dice.

### Changes in `src/pages/BackgammonGame.tsx`:

1. Add a new ref near the other refs (around line 237):
   ```ts
   const diceRolledThisTurnRef = useRef(false);
   ```

2. In `rollDice()` (line 1670), set the ref to true right after `setDice(newDice)`:
   ```ts
   diceRolledThisTurnRef.current = true;
   ```

3. In the polling turn-change handler (lines 897-903), use the ref guard:
   ```ts
   // Only clear dice if we haven't rolled this turn yet
   if (!diceRolledThisTurnRef.current) {
     setDice([]);
     setRemainingMoves([]);
   }
   ```

4. In the WebRTC `turn_end` handler (lines 1430-1434), same ref guard:
   ```ts
   if (!diceRolledThisTurnRef.current) {
     setDice([]);
     setRemainingMoves([]);
   }
   ```

5. Reset the ref when the turn genuinely changes (line 890, where `setCurrentTurnWallet(freshTurnWallet)` is called):
   ```ts
   diceRolledThisTurnRef.current = false;
   setCurrentTurnWallet(freshTurnWallet);
   ```

---

## Problem 2: Share Page Not Loading

**Root cause:** BackgammonGame passes `isStaked={false}` to `GameEndScreen` (line 2816), and it does NOT use `useAutoSettlement`. This means:
- `GameEndScreen` skips all settlement logic (because `isStaked` is false)
- No `settle-game` edge function is called
- `match_share_cards` is never populated
- The `/match/:roomPda` share page shows "Match not found"

**Fix:** Add `useAutoSettlement` to BackgammonGame and pass correct `isStaked` prop.

### Changes in `src/pages/BackgammonGame.tsx`:

1. Add import (near line 32):
   ```ts
   import { useAutoSettlement } from "@/hooks/useAutoSettlement";
   ```

2. Add the hook after the outcome resolver (around line 346), using `winnerWallet` state:
   ```ts
   const autoSettlement = useAutoSettlement({
     roomPda,
     winner: winnerWallet,
     reason: "gameover",
     isRanked: isRankedGame,
   });
   ```

3. Fix the `isStaked` prop on `GameEndScreen` (line 2816):
   ```tsx
   isStaked={isRankedGame && stakeLamports > 0}
   ```

---

## Summary

| File | Change |
|------|--------|
| `src/pages/BackgammonGame.tsx` | Add `diceRolledThisTurnRef` to prevent polling/WebRTC from clearing dice after a roll |
| `src/pages/BackgammonGame.tsx` | Add `useAutoSettlement` hook to trigger settlement when game ends |
| `src/pages/BackgammonGame.tsx` | Fix `isStaked` prop to reflect actual ranked/staked status |

No database changes needed. No edge function changes needed.

