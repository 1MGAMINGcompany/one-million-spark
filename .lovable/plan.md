

# Fix Similar Issues in Checkers Ranked Game

## Analysis of All Games

After reviewing all ranked game files, here's the risk assessment:

| Game | Win Detection | myColor Risk | Missing winnerWallet | Needs Fix? |
|------|--------------|-------------|---------------------|------------|
| Chess | Fixed in previous change | Fixed | Fixed | Done |
| Checkers | `result === myColor` after checkGameOver | YES - same stale closure risk | YES - not set on normal win | YES |
| Backgammon | Centralized DB Outcome Resolver | No - uses DB as source of truth | No - resolver sets it | No |
| Dominos | player1/player2 + DB polling | Low - uses amIPlayer1 boolean | Handled via winner state | No |
| Ludo | PlayerColor index-based | Low - uses myPlayerIndex | Handled via engine | No |

**Only Checkers has the same bugs as Chess.** Backgammon already uses a robust DB-based outcome resolver. Dominos and Ludo use different patterns that don't suffer from stale `myColor`.

## Changes (single file: `src/pages/CheckersGame.tsx`)

### Fix 1: Use a ref for myColor in win detection

The `checkGameOver` function itself is fine (returns "gold" or "obsidian" objectively), but the comparison `result === myColor` at lines 1109, 1165, and 924 can use a stale `myColor`. A `myColorRef` already exists (line 148) and is kept in sync -- but the inline handler at lines 1109 and 1165 uses `myColor` directly instead of `myColorRef.current`.

- Line 1109: Change `result === myColor` to `result === myColorRef.current`
- Line 1165: Change `result === myColor` to `result === myColorRef.current`

### Fix 2: Set winnerWallet on normal game-over

Lines 1107-1109 and 1162-1165 detect game over but never call `setWinnerWallet(...)`. This means the `winnerAddress` memo (line 643) falls back to the `gameOver === myColor` path, which can be wrong if `myColor` is stale.

After `setGameOver(result)` at lines 1108 and 1164, add:
```
const winAddr = result === myColorRef.current
  ? effectivePlayerId
  : getOpponentWallet(roomPlayersRef.current, effectivePlayerId);
setWinnerWallet(winAddr || null);
```

Same fix for the WebRTC handler at line 922-925 (already uses `myColorRef` but doesn't set `winnerWallet`).

### Fix 3: Add victory announcement (matching Chess)

Same 3-second overlay pattern as Chess:
- Add `victoryAnnouncement` and `showEndScreen` states
- On game over (not draw/forfeit), show "Gold wins!" or "Obsidian wins!" for 3 seconds
- Gate `GameEndScreen` on `showEndScreen` instead of `gameOver`
- Draws/resigns show end screen immediately

### Summary

| Location | Change |
|----------|--------|
| Lines 1108-1109 | Add `setWinnerWallet`, use `myColorRef.current` |
| Lines 1163-1165 | Add `setWinnerWallet`, use `myColorRef.current` |
| Lines 922-925 | Add `setWinnerWallet` for WebRTC received game-over |
| New states | `victoryAnnouncement`, `showEndScreen` |
| GameEndScreen gate | Change from `gameOver` to `showEndScreen` |
| New JSX | Victory announcement overlay (golden text, 3s auto-dismiss) |

No changes needed for Backgammon, Dominos, or Ludo.

