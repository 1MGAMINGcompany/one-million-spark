

# Fix Draw Handling in Checkers and Dominos

## Summary

Apply the same draw handling fixes from Chess to Checkers and Dominos: pass winner wallet to `finishSession`, show draw-specific UI in GameEndScreen, and add draw reason text.

---

## Changes

### File 1: `src/pages/CheckersGame.tsx`

**A. Pass winnerWallet to finishCheckersSession (line 307)**
Currently calls `finishCheckersSession()` with no arguments. Change to pass the winner wallet address so the DB records who won (or "draw"):
```
finishCheckersSession(winnerAddress);
```

**B. Fix draw color in game status text (line 1454-1457)**
The draw case shows `text-red-400` (loss color) because `gameOver === "draw"` doesn't match `myColor`. Add draw check:
```
gameOver === "draw" ? "text-yellow-400" : gameOver === myColor ? "text-green-400" : "text-red-400"
```

**C. Pass `result` prop to GameEndScreen (line 1499-1510)**
Add a `result` prop with the draw reason so GameEndScreen can show "Draw - No Moves Available" or the specific reason.

**D. Fix winnerName for draws (line 1502)**
Currently `winnerName` lookup will fail for draws since "draw" isn't a player address. Guard it like Dominos does:
```
winnerName={winnerAddress === "draw" ? undefined : gameEndPlayers.find(...)}
```

### File 2: `src/pages/DominosGame.tsx`

**A. Pass winnerWallet to finishSession (line 498)**
Currently calls `finishSession()` with no arguments. Change to:
```
finishSession(winnerAddress);
```

**B. Add draw reason to game status (lines 1044-1045, 1192-1194)**
Change "Game blocked - Draw!" to a more descriptive status that includes the reason (pip comparison). The `gameStatus` is used as the `result` prop.

**C. Pass `result` prop to GameEndScreen (line 1726-1736)**
Add `result={gameStatus}` so the draw reason appears in the end screen.

### File 3: `src/components/GameEndScreen.tsx`

No additional changes needed -- the draw-specific UI (refund messaging, "DRAW" header) was already implemented in the Chess fix. The `result` prop will show the draw reason. Just need to make sure the game pages pass it.

---

## Technical Details

| File | Change |
|------|--------|
| `src/pages/CheckersGame.tsx` | Pass winner to finishSession, fix draw styling, pass result prop, guard winnerName for draws |
| `src/pages/DominosGame.tsx` | Pass winner to finishSession, pass result prop to GameEndScreen |

## What Does NOT Change
- GameEndScreen component (already fixed for draws in Chess PR)
- useGameSessionPersistence hook (already accepts winnerWallet param from Chess PR)
- Settlement edge functions
- Backgammon and Ludo (no draw states)

