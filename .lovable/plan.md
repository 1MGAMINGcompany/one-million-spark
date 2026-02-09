

# Fix Chess FEN Desync on Self-Timeout + Timer Display Per-Turn-Owner

## Test Results Summary (Room Gu8HCXHM, 10s turns)

The game played 8 turns: 2 timeouts for Fbk1, 1 timeout for 4aTb, 5 successful chess moves, ending in a manual resign/forfeit.

The FEN flip patch from earlier IS working for polling-detected timeouts (turns 2-6 played successfully after turn 1 timeout). However, two issues remain:

---

## Bug #1: FEN not flipped on SELF-timeout

**File:** `src/pages/ChessGame.tsx`, lines 573-583

When `handleTurnTimeout` fires (your OWN turn expired), it calls the server RPC and gets `result.nextTurnWallet`. It then sets `setTurnOverrideWallet(result.nextTurnWallet)` -- but does NOT flip the chess.js FEN active color. The FEN flip was only added to:
- Polling handler (line 713) -- works
- Visibility handler (line 814) -- works
- Self-timeout handler (line 582) -- MISSING

This means after your own timeout, the opponent's engine still thinks it's your color's turn. Their move is rejected by chess.js.

**Fix:** Add the same FEN flip after line 582:

```typescript
setTurnOverrideWallet(result.nextTurnWallet);

// Flip chess.js FEN active color to match server state
setGame(prev => {
  const fen = prev.fen();
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  try { return new Chess(parts.join(' ')); }
  catch { return prev; }
});
```

---

## Bug #2: Timer visible to both players

**File:** `src/components/TurnStatusHeader.tsx`, line 118

Currently, the timer displays whenever `showTimer && remainingTime > 0`. Both players see the same countdown ticking. The user wants:
- Timer ONLY visible to the player whose turn it is
- When it becomes your turn, timer starts at the full chosen time (e.g., 10s)
- When it's opponent's turn, no timer shown to you

**Fix:** Change line 118 from:

```typescript
{showTimer && remainingTime > 0 && (
```

to:

```typescript
{showTimer && remainingTime > 0 && isMyTurn && (
```

The `isMyTurn` prop is already passed to `TurnStatusHeader`. This hides the countdown when it's not your turn, and shows it starting from full time when your turn begins (since `useTurnTimer` resets from `turnStartedAt`).

---

## Files to Modify

| File | Line | Change |
|------|------|--------|
| `src/pages/ChessGame.tsx` | 582 | Add FEN flip after `setTurnOverrideWallet` in self-timeout handler |
| `src/components/TurnStatusHeader.tsx` | 118 | Add `isMyTurn &&` condition to timer display |

## Verification Checklist

1. Create ranked chess game with 10s turns
2. Let White's timer expire (self-timeout fires via `handleTurnTimeout`)
3. Black's board is enabled, Black can move a piece (FEN is flipped)
4. While it's Black's turn, White does NOT see a countdown timer
5. When turn flips to White, timer appears starting at 10s
