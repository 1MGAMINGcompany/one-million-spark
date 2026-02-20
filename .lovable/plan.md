
# Fix: Share Card Not Showing After Winning Checkers (and Full Audit of All AI Games)

## Root Cause Identified

The previous fix only patched the **player's move handler**. But there are two more game-over paths in CheckersAI that were completely missed — both inside the **AI's own move handlers**. When a player wins because the AI moves itself into a losing position (no pieces left), the game ends through the AI's handler, not the player's. Those paths call `setGameOver` and play the win sound correctly, but **never call `recordWin()` or `setShowShareCard(true)`**.

### The Two Missing Paths in CheckersAI.tsx

**Path A — AI regular move ends the game (lines 453-460):**
```typescript
const result = checkGameOver(newBoard);
if (result) {
  setGameOver(result);
  play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
  // ❌ NO recordWin, NO setShowShareCard here
} else {
  setCurrentPlayer("gold");
}
```

**Path B — AI chain capture ends the game (lines 491-500):**
```typescript
const result = checkGameOver(boardRef.current);
if (result) {
  setGameOver(result);
  play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
  // ❌ NO recordWin, NO setShowShareCard here
} else {
  setCurrentPlayer("gold");
}
```

This explains exactly why the user's win wasn't tracked or shown — the game ended on the **AI's turn** (the AI's last move removed its own ability to move), which goes through Path A or B above.

### Full Game-Over Map (All Paths in CheckersAI)

| Path | Where | Player Wins tracked? | Player Loss tracked? | Share card? |
|------|--------|---------------------|---------------------|-------------|
| Player chain capture ends game | Line 318-333 | ✅ | ✅ | ✅ |
| Player normal move ends game | Line 367-381 | ✅ | ✅ | ✅ |
| AI has no moves (initial) | Line 422-430 | ✅ | — | ✅ |
| **AI regular move ends game** | **Line 453-460** | **❌** | **❌** | **❌** |
| **AI chain capture ends game** | **Line 491-500** | **❌** | **❌** | **❌** |

### Other AI Games — Status

- **ChessAI.tsx** — Uses a single `checkGameOver()` function called from both player and AI paths. Share card is correctly wired. ✅ OK
- **BackgammonAI.tsx** — Already correct. ✅ OK
- **DominosAI.tsx** — Already correct. ✅ OK
- **LudoAI.tsx** — Already correct. ✅ OK

Only CheckersAI has the remaining gap.

## The Fix

Patch both missing paths in `CheckersAI.tsx` to match the pattern already used in the working paths:

**Path A fix (after AI regular move):**
```typescript
const result = checkGameOver(newBoard);
if (result) {
  setGameOver(result);
  play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
  // ADD:
  if (result === 'gold') {
    const dur = getDuration();
    recordWin();
    setWinDuration(dur);
    setShowShareCard(true);
  } else if (result === 'obsidian') {
    recordLoss();
  }
} else {
  setCurrentPlayer("gold");
}
```

**Path B fix (after AI chain capture):**
```typescript
const result = checkGameOver(boardRef.current);
if (result) {
  setGameOver(result);
  play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
  // ADD:
  if (result === 'gold') {
    const dur = getDuration();
    recordWin();
    setWinDuration(dur);
    setShowShareCard(true);
  } else if (result === 'obsidian') {
    recordLoss();
  }
} else {
  setCurrentPlayer("gold");
}
```

## Files to Change

| File | Lines | Change |
|------|-------|--------|
| `src/pages/CheckersAI.tsx` | 453-460 | Add `recordWin`/`recordLoss`/`setShowShareCard` to AI regular move game-over path |
| `src/pages/CheckersAI.tsx` | 491-500 | Add `recordWin`/`recordLoss`/`setShowShareCard` to AI chain capture game-over path |

Also need to add `getDuration`, `recordWin`, `recordLoss`, `setWinDuration`, `setShowShareCard` to the dependency arrays of both `useEffect` hooks that contain these paths.

## Why This Wasn't Caught Before

The original fix specifically targeted `handleSquareClick` — the player's interaction handler. But checkers can end on the AI's turn: if the AI captures the player's last piece, or if the player's last move forces the AI into a dead-end that the AI then confirms by moving — all of those end via the AI's `useEffect`. The session replay confirms the game ended while piece counts were dropping, which is consistent with the AI making the final capture.
