
# Fix Game Freeze After 5 Moves - Turn Timer Bugs

## Root Cause Analysis

After investigating the database logs and code, I found **two critical bugs** causing the game freeze:

### Bug 1: Move Persistence Not Enabled for Private Mode

All 5 game files have `useDurableGameSync` only enabled for ranked mode:
```typescript
enabled: isRankedGame && roomPlayers.length >= 2
```

But the timer fix now enables timers for private mode. Without move persistence:
- Turn changes aren't recorded in the database
- `turn_started_at` stays stale
- Opponent timeout detection sees old timestamps and fires incorrectly
- Both players get out of sync

### Bug 2: Wrong `nextTurnWallet` in Timeout Handler

Looking at the database moves:
```
Turn 1: timedOutWallet = AtLG... (player 2), nextTurnWallet = AtLG... (player 2!)
Turn 2: timedOutWallet = Fbk1... (player 1), nextTurnWallet = AtLG... (player 2)
```

The code always sets `nextTurnWallet: opponentWalletAddr` regardless of who timed out:
```typescript
nextTurnWallet: opponentWalletAddr,  // ALWAYS opponent - WRONG!
```

**Correct logic:**
- If **I** time out → nextTurnWallet = opponent (I skip)
- If **opponent** times out → nextTurnWallet = ME (I get turn)

---

## Fix Implementation

### Part 1: Enable Move Persistence for Private Mode

Update `useDurableGameSync` enabled condition in all 5 game files:

```typescript
// Before:
enabled: isRankedGame && roomPlayers.length >= 2

// After:
enabled: (isRankedGame || isPrivate) && roomPlayers.length >= 2
```

**Files to update:**
- `src/pages/ChessGame.tsx` (line 395)
- `src/pages/CheckersGame.tsx` (line 334)
- `src/pages/DominosGame.tsx` (line 521)
- `src/pages/LudoGame.tsx` (line 328)
- `src/pages/BackgammonGame.tsx` (line 651 - update `durableEnabled`)

### Part 2: Fix `nextTurnWallet` Logic in Timeout Handlers

In all timeout handlers, fix the `nextTurnWallet` to be dynamic based on who timed out:

```typescript
// Before:
nextTurnWallet: opponentWalletAddr,

// After:
nextTurnWallet: iTimedOut ? opponentWalletAddr : address,
```

**Logic:**
- `iTimedOut = true` → I timed out → opponent gets turn
- `iTimedOut = false` → opponent timed out → I get turn

**Files to update:**
- `src/pages/ChessGame.tsx` (line 588)
- `src/pages/CheckersGame.tsx` (line 509)
- `src/pages/DominosGame.tsx` (line 665)
- `src/pages/BackgammonGame.tsx` (lines 1669, 1681 if applicable)
- `src/pages/LudoGame.tsx` (if has similar pattern)

---

## Technical Details

### Database Evidence

Current session state shows the issue:
```
room_pda: 8aWmbrp8...
current_turn_wallet: AtLGmLU3... (player 2)
turn_started_at: 2026-01-28 00:13:29
turn_time_seconds: 10
```

The moves show timeout events firing every ~10 seconds with wrong `nextTurnWallet`:
```
Turn 1: timedOutWallet=AtLG, nextTurnWallet=AtLG (WRONG - should be Fbk1)
Turn 2: timedOutWallet=Fbk1, nextTurnWallet=AtLG (correct, Fbk1 timed out)
```

### Why Game Freezes

1. Timer fires for player 1 → timeout recorded with wrong `nextTurnWallet`
2. Database says player 2's turn, but timer logic says player 1's turn
3. Both players see different states
4. After a few turns, game appears frozen because turns don't match

---

## Files Summary

| File | Changes |
|------|---------|
| `src/pages/ChessGame.tsx` | Enable DurableSync for private + fix nextTurnWallet |
| `src/pages/CheckersGame.tsx` | Enable DurableSync for private + fix nextTurnWallet |
| `src/pages/BackgammonGame.tsx` | Enable DurableSync for private + fix nextTurnWallet |
| `src/pages/DominosGame.tsx` | Enable DurableSync for private + fix nextTurnWallet |
| `src/pages/LudoGame.tsx` | Enable DurableSync for private + fix nextTurnWallet |

---

## Expected Results After Fix

1. Private games with turn time will properly persist moves to database
2. When timeout occurs, correct player gets the turn
3. Both players stay in sync via database polling
4. 3-strike forfeit logic works correctly
