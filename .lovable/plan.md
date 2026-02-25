
# Fix: Settlement Error + Mobile Board Movement

## Issue 1: "Cannot resolve winner seat: No winnerSeat or gameOver found in game_state"

### Root Cause

The `settle-game` edge function determines the winner by reading `game_state.winnerSeat` or `game_state.gameOver` from the `game_sessions` table. However, chess saves its `game_state` as:

```text
{
  fen: "...",
  moveHistory: [...],
  gameOver: true,       // <-- boolean, not a color string
  gameStatus: "Checkmate - You win!"
}
```

The `resolveWinnerSeat()` function at line 96-138 of `settle-game/index.ts`:
- Priority 1: Looks for `winnerSeat` as a number (0-3) -- chess never sets this
- Priority 2: Looks for `gameOver` as a **string** like "white", "black", or "0", "1" -- chess sets it as `true` (boolean)
- Result: Falls through to "No winnerSeat or gameOver found" error

The `game_sessions.winner_wallet` column IS set correctly by the `finish_game_session` RPC, but `settle-game` never reads it as a fallback.

### Fix

Two changes needed (belt-and-suspenders approach):

**A. Edge function (`settle-game/index.ts`)**: Add a Priority 0 fallback -- before checking `game_state`, check if `game_sessions.winner_wallet` is already set (which it is for chess forfeit/checkmate). If so, find that wallet's seat index in the on-chain `players[]` array and use it directly.

Modify the query at line 483-487 to also select `winner_wallet`:
```text
.select("game_state, game_type, winner_wallet")
```

Then add a check before `resolveWinnerSeat`: if `sessionRow.winner_wallet` exists, find it in `playersOnChain` to get the seat index directly, bypassing `resolveWinnerSeat` entirely.

**B. Client-side (`ChessGame.tsx`)**: When saving game state, include a `gameOver` field as a color string (e.g., "white" or "black") instead of a boolean. This ensures future settlement calls work even without the edge function fallback.

In the `saveSession` call around line 326-339, change the persisted state to include `gameOver` as a winning color string when applicable:
```text
gameOver: gameOver 
  ? (winnerWallet === 'draw' ? 'draw' 
     : winnerWallet === effectivePlayerId ? (effectiveColor === 'w' ? 'white' : 'black')
     : (effectiveColor === 'w' ? 'black' : 'white'))
  : false,
```

Also add `winnerSeat` as a numeric field (0 for white, 1 for black) for direct resolution.

## Issue 2: Mobile Screen Still Moving During Turns

### Root Cause

The `TurnStatusHeader` fixes (opacity-0, min-h, transition-colors) are applied. However, there are two remaining sources of layout shift in `ChessGame.tsx`:

1. **Status Bar (line 1402)**: Uses `transition-all duration-300` which animates height/padding changes when the resign button appears/disappears (`{!gameOver && ...}` at line 1414).

2. **Player status dots (TurnStatusHeader line 155)**: Each player dot uses `transition-all` which can cause micro-shifts when `ring-1 ring-primary/50` toggles on/off for the active player.

### Fix

**A. `ChessGame.tsx` line 1402**: Change `transition-all` to `transition-colors` on the status bar.

**B. `TurnStatusHeader.tsx` line 155**: Change `transition-all` to `transition-colors` on player status row items.

---

## Technical Details

### File: `supabase/functions/settle-game/index.ts`

1. At line 483-487, change the select to include `winner_wallet`:
```text
.select("game_state, game_type, winner_wallet")
```

2. After line 498, before calling `resolveWinnerSeat`, add a winner_wallet fallback:
```text
// Priority 0: If winner_wallet is already set in DB, resolve seat from on-chain players
if (sessionRow.winner_wallet) {
  const walletIndex = playersOnChain.indexOf(sessionRow.winner_wallet);
  if (walletIndex >= 0) {
    console.log("[settle-game] Winner resolved from DB winner_wallet:", {
      wallet: sessionRow.winner_wallet.slice(0, 12),
      seatIndex: walletIndex,
    });
    // Skip resolveWinnerSeat -- jump directly to seat-based settlement
    // (use walletIndex as seatIndex)
  }
}
```

This requires restructuring lines 504-514 to use the DB-derived seat as a fallback when `resolveWinnerSeat` fails.

### File: `src/pages/ChessGame.tsx`

1. Lines 326-331 -- Update `PersistedChessState` saved to include a color-based `gameOver`:
```text
const winnerColor = winnerWallet === 'draw' ? 'draw'
  : winnerWallet === effectivePlayerId 
    ? (effectiveColor === 'w' ? 'white' : 'black')
    : winnerWallet 
      ? (effectiveColor === 'w' ? 'black' : 'white')
      : false;

const persisted: PersistedChessState = {
  fen: game.fen(),
  moveHistory,
  gameOver: winnerColor || gameOver,
  gameStatus,
  winnerSeat: winnerColor === 'white' ? 0 : winnerColor === 'black' ? 1 : undefined,
};
```

2. Line 1402 -- Change `transition-all` to `transition-colors`:
```text
className={`relative overflow-hidden rounded-lg border transition-colors duration-300 ${
```

### File: `src/components/TurnStatusHeader.tsx`

Line 155 -- Change `transition-all` to `transition-colors`:
```text
"flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
```

### What is NOT touched
- No database migrations
- No game logic changes (checkmate detection, move validation, etc.)
- No board sizing or layout restructuring
- No changes to other games (checkers, backgammon, etc. already use color-based gameOver)
