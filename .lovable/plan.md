

# Debug Plan: Add Diagnostic Logs to Chess Timer Flow

## Goal
Add minimal temporary `console.log` statements to trace exactly why the countdown sometimes fails to appear on the active player's turn. No logic changes.

## Changes

### 1. `src/pages/ChessGame.tsx` — Log `isMyTurn` computation (after line 511)

Add one log right after `isMyTurn` is computed:

```typescript
// After line 511
console.log("[Chess] isMyTurn debug:", {
  isMyTurn,
  isActuallyMyTurn,
  isMyTurnFromEngine,
  isMyTurnOverride,
  turnOverrideWallet: turnOverrideWallet?.slice(0, 8),
  activeTurnAddress: activeTurnAddress?.slice(0, 8),
  addressRef: addressRef.current?.slice(0, 8),
  canPlay,
  gameOver,
  effectiveTurnTime,
});
```

### 2. `src/components/TurnStatusHeader.tsx` — Log before timer render

Add one log right before the timer/syncing JSX block (before the `showTimer && isMyTurn && remainingTime > 0` conditional):

```typescript
if (showTimer) {
  console.log("[TimerUI]", { isMyTurn, remainingTime, showTimer });
}
```

### 3. `src/hooks/useTurnTimer.ts` — Log every 5s inside the countdown interval

Inside the `setInterval` callback (line 116), add a throttled log:

```typescript
// Inside setInterval, before the return
if (newTime > 0 && newTime % 5 === 0) {
  console.log("[useTurnTimer] tick:", {
    roomId: roomId?.slice(0, 8),
    remainingTime: newTime,
    isMyTurn,
    enabled,
  });
}
```

## What these logs will reveal

- **isMyTurn is false when it shouldn't be**: `canPlay` is false, or `turnOverrideWallet` hasn't been set yet, or `addressRef` is null.
- **remainingTime is stuck at 0 or full value**: The interval isn't running (killed by the `!isMyTurn` guard on line 109), or `resetTimer` is being called repeatedly by polling.
- **Timer UI hidden despite countdown running**: `showTimer` prop is false, or `isMyTurn` differs between ChessGame and TurnStatusHeader.

## Files to edit
- `src/pages/ChessGame.tsx` (1 log addition)
- `src/components/TurnStatusHeader.tsx` (1 log addition)
- `src/hooks/useTurnTimer.ts` (1 log addition inside interval)

