

# Fix Chess Draw Handling + Winner Recording

## Issues Found

### 1. CRITICAL: Draw shows "You Lose" instead of "Draw"
**Root cause:** In `ChessGame.tsx` line 743, the `winnerAddress` memo checks `gameStatus.includes("draw")` (lowercase), but the translated text is `"Draw"` (capital D). JavaScript `includes()` is case-sensitive, so `"Draw".includes("draw")` returns `false`. The logic falls through to `getOpponentWallet()`, making the GameEndScreen think you lost.

### 2. No draw reason shown (50-move rule, threefold repetition, etc.)
**Root cause:** In `checkGameOverInline` (line 860), when `isDraw()` triggers, it just sets `t("game.draw")` = "Draw" with no explanation. chess.js can differentiate between `isThreefoldRepetition()`, `isInsufficientMaterial()`, and the 50-move rule, but the code doesn't check.

### 3. Winner wallet not saved to DB on checkmate
**Root cause:** `finishChessSession()` (line 344-348) calls `finish_game_session` RPC without passing `p_winner_wallet`. The winner is never recorded in the database, preventing settlement and share card generation.

### 4. Draw end screen shows payout info instead of refund info
The `GameEndScreen` shows winner payout math even for draws. For draws, it should show "Your SOL is being returned to you."

### 5. No match_share_card generated for draws
The auto-settlement triggers `settle-draw`, but no share card is created for the draw result.

### 6. Missed turns shows 1 for both players
Both players have `missed_turns: 1`. This could be legitimate (each player ran one turn timer down) or a timing issue with the polling interval. The timer logic looks correct -- this is likely genuine.

---

## Plan

### File 1: `src/pages/ChessGame.tsx`

**A. Fix winnerAddress draw detection (line 743)**
Change case-sensitive string check to case-insensitive:
```
gameStatus.toLowerCase().includes("draw") || gameStatus.toLowerCase().includes("stalemate")
```

**B. Add draw reason detection (lines 855-864)**
Replace the generic draw checks with specific reason detection:
```
if (currentGame.isStalemate()) {
  setGameStatus("Draw - Stalemate");
  setWinnerWallet("draw");
  ...
}
if (currentGame.isThreefoldRepetition()) {
  setGameStatus("Draw - Threefold Repetition");
  setWinnerWallet("draw");
  ...
}
if (currentGame.isInsufficientMaterial()) {
  setGameStatus("Draw - Insufficient Material");
  setWinnerWallet("draw");
  ...
}
if (currentGame.isDraw()) {
  setGameStatus("Draw - 50-Move Rule");
  setWinnerWallet("draw");
  ...
}
```

**C. Set winnerWallet on checkmate (line 846-854)**
When checkmate is detected, set `winnerWallet` to the actual winner's wallet address so it gets saved to DB and triggers settlement:
```
const winnerAddr = isPlayerWin ? effectivePlayerId : getOpponentWallet(roomPlayers, effectivePlayerId);
setWinnerWallet(winnerAddr || null);
```

**D. Pass winner to finishChessSession (lines 344-348)**
Update the `finishSession` call to pass `winnerAddress` so the DB records the winner:
```
finishChessSession(winnerAddress);
```

### File 2: `src/hooks/useGameSessionPersistence.ts`

**A. Accept winner parameter in finishSession**
Update `finishSession` to accept an optional `winnerWallet` parameter and pass it to the RPC:
```
const finishSession = async (winnerWallet?: string | null) => {
  await supabase.rpc('finish_game_session', {
    p_room_pda: roomPda,
    p_caller_wallet: callerWallet || null,
    p_winner_wallet: winnerWallet || null,
  });
};
```

### File 3: `src/components/GameEndScreen.tsx`

**A. Show draw-specific UI instead of win/loss payout**
When `isDraw` is true:
- Show "DRAW" header with the draw reason (from `result` prop)
- Show "Your SOL is being returned" instead of winner payout summary
- Hide "Winner" section
- Adjust share button text for draws

**B. Show refund status for draws**
Replace payout math with refund info when `isDraw`:
```
"Your stake of X.XXXX SOL is being refunded to your wallet."
```

### File 4: `src/i18n/locales/en.json`

Add new translation keys:
- `game.drawThreefold`: "Draw - Threefold Repetition"
- `game.drawInsufficientMaterial`: "Draw - Insufficient Material"  
- `game.draw50Move`: "Draw - 50-Move Rule"
- `gameEnd.drawRefund`: "Your stake is being returned to your wallet"
- `gameEnd.drawResult`: "Draw"
- `gameEnd.drawReason`: "Reason"

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | Fix draw detection, add draw reasons, set winner on checkmate, pass winner to finish |
| `src/hooks/useGameSessionPersistence.ts` | Accept winner param in finishSession |
| `src/components/GameEndScreen.tsx` | Draw-specific UI with refund messaging |
| `src/i18n/locales/en.json` | Add draw reason translation keys |

## What Does NOT Change
- Settlement edge functions (settle-game, settle-draw) -- unchanged
- Other game pages (backgammon, checkers, dominos, ludo) -- unchanged (but would benefit from same fix later)
- Navbar/dropdown -- untouched

