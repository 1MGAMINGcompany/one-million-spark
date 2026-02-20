
# Fix: Checkers AI Win/Loss Events Not Being Recorded

## Root Cause

`CheckersAI.tsx` has three code paths that can end the game. Two of them call `recordWin()` / `recordLoss()` correctly, but **one critical path is missing the tracking calls entirely**.

The missing path is the **standard (non-chain) player move** that ends the game — which is how most games finish. If the player wins or loses on a normal move (not a chain capture), the outcome is never sent to `ai_game_events`.

```
// ✅ Path 1: Chain-capture end (lines 318-333) — has recordWin/recordLoss
// ❌ Path 2: Normal move end (lines 367-374) — MISSING recordWin/recordLoss
// ✅ Path 3: AI has no moves left (lines 414-420) — has recordWin
```

The specific broken block is lines 367–374:
```typescript
const result = checkGameOver(newBoard);
if (result) {
  setGameOver(result);
  play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
  // ← recordWin() and recordLoss() are never called here
} else {
  setCurrentPlayer("obsidian");
}
```

## The Fix

Add the missing `recordWin()` / `recordLoss()` calls and share card trigger to the normal-move game-over path in `handleSquareClick`, matching the pattern already used in the chain-capture path.

```typescript
const result = checkGameOver(newBoard);
if (result) {
  setGameOver(result);
  play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
  // ADD THESE:
  if (result === 'gold') {
    const dur = getDuration();
    recordWin();
    setWinDuration(dur);
    setShowShareCard(true);
  } else if (result === 'obsidian') {
    recordLoss();
  }
} else {
  setCurrentPlayer("obsidian");
}
```

## What Changes

| File | Change |
|---|---|
| `src/pages/CheckersAI.tsx` | Add `recordWin()` / `recordLoss()` + share card to the normal-move game-over path (lines 367-374) |

## Why Only Checkers Is Confirmed Affected

The database shows checkers has 2 `game_started` events and **0** `game_won`/`game_lost` events — a 100% miss rate on outcomes. The dominos game this morning was able to record a win/loss correctly, so that page is fine.

The other AI pages (Chess, Backgammon, Dominos, Ludo) should be audited for the same pattern but are lower priority since dominos at least shows correct tracking.

## What This Does NOT Fix

- Games already played (including yours 30 minutes ago) cannot be retroactively added — the event was never sent to the server
- The fix only ensures all **future** games record correctly

## Files to Change

1. `src/pages/CheckersAI.tsx` — add 5 lines to the normal-move game-over handler
