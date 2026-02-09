

# Fix: Settlement Still Broken -- Two Missing Dependencies

## Problem

The settle-game fallback added in the previous change will **never work** because:

1. **`winnerSeat` is never persisted to `game_state`** -- The save effect in Chess, Checkers, and Backgammon uses `winnerWallet` to compute `winnerSeat`, but `winnerWallet` is NOT in the `useEffect` dependency array. When `gameOver` becomes true, `winnerWallet` is still null (set by a separate handler). The save fires once without `winnerSeat`, then never re-fires when `winnerWallet` arrives.

2. **`winner_wallet` is always null in `game_sessions`** -- The `finishSession()` function in `useGameSessionPersistence.ts` hardcodes `p_winner_wallet: null`. So the DB fallback in settle-game reads null and also fails.

Both paths to resolve the winner in settle-game are broken -- the game_state path and the DB fallback path.

## Fix

### 1. Add `winnerWallet` to save effect dependency arrays (4 files)

| File | Line | Current deps | Add |
|------|------|-------------|-----|
| `ChessGame.tsx` | 337 | `[game, moveHistory, gameOver, gameStatus, roomPlayers, saveChessSession, roomMode]` | `winnerWallet` |
| `CheckersGame.tsx` | 285 | `[board, currentPlayer, gameOver, roomPlayers, saveCheckersSession, roomMode]` | `winnerWallet` |
| `BackgammonGame.tsx` | 511 | `[gameState, dice, ..., roomPlayers, saveBackgammonSession, roomMode]` | `winnerWallet` |
| `LudoGame.tsx` | 282 | Ludo uses `gameOver` directly as winner -- verify if dependency needed |

This ensures that when `winnerWallet` is set after `gameOver`, the save effect re-fires and persists `winnerSeat` in the game_state.

### 2. Pass `winnerWallet` to `finishSession` (1 file + 5 callers)

Update `useGameSessionPersistence.ts`:
- Add optional `winnerWallet` parameter to `finishSession`
- Pass it as `p_winner_wallet` instead of hardcoded `null`

Update all game pages' finish effect to pass `winnerWallet`:
```typescript
useEffect(() => {
  if (gameOver && roomPlayers.length >= 2) {
    finishSession(winnerWallet);  // was: finishSession()
  }
}, [gameOver, roomPlayers.length, finishSession, winnerWallet]);
```

This ensures `game_sessions.winner_wallet` is set before settle-game reads it.

### 3. Add `winnerWallet` to finish effect dependency arrays (5 files)

The finish effect also needs `winnerWallet` in its deps so it re-fires when the winner is determined. Currently it fires immediately when `gameOver` becomes true but `winnerWallet` might still be null.

## Technical Details

### useGameSessionPersistence.ts change

```typescript
const finishSession = useCallback(async (winnerWallet?: string | null) => {
  if (!roomPda || !enabled) return;
  try {
    const { error } = await supabase.rpc('finish_game_session', {
      p_room_pda: roomPda,
      p_caller_wallet: callerWallet || null,
      p_winner_wallet: winnerWallet || null,  // was: null
    });
    // ...
  }
}, [roomPda, enabled, callerWallet]);
```

### Game page save effect fix (example: ChessGame.tsx)

```typescript
}, [game, moveHistory, gameOver, gameStatus, roomPlayers, saveChessSession, roomMode, winnerWallet]);
//                                                                                    ^^^^^^^^^^^^ ADDED
```

### Game page finish effect fix (example: ChessGame.tsx)

```typescript
useEffect(() => {
  if (gameOver && roomPlayers.length >= 2 && winnerWallet) {
    finishChessSession(winnerWallet);
  }
}, [gameOver, roomPlayers.length, finishChessSession, winnerWallet]);
```

Note: We gate on `winnerWallet` being truthy to ensure we don't call finish with null. For draws, the draw settlement path handles it separately.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useGameSessionPersistence.ts` | Accept optional `winnerWallet` param in `finishSession`, pass to RPC |
| `src/pages/ChessGame.tsx` | Add `winnerWallet` to save and finish effect deps, pass to `finishSession` |
| `src/pages/CheckersGame.tsx` | Same |
| `src/pages/BackgammonGame.tsx` | Same |
| `src/pages/DominosGame.tsx` | Same (finish effect only -- save already works) |
| `src/pages/LudoGame.tsx` | Same |

