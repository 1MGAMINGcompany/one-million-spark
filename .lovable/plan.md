
# Fix Turn Timer Visibility for All Game Modes

## Problem Summary

The turn timer is only visible in **ranked mode** and is gated by `canPlay`, which hides it when it's the opponent's turn. Private rooms with turn time configured don't show the timer and the 3-strikes forfeit logic doesn't trigger.

## Current Broken Logic (All 5 Game Files)

```
useTurnTimer:     enabled: isRankedGame && canPlay && !gameOver
showTimer:        {isRankedGame && canPlay}
opponentTimeout:  enabled: isRankedGame && canPlay && !gameOver
```

**Problems:**
- `isRankedGame` excludes private mode (where users can set turn time)
- `canPlay` means timer only shows when it's MY turn AND rules accepted
- Both players should see the countdown at all times once game starts

## Fixed Logic

The timer should be based on a single truth: **`turnTimeSeconds > 0`** (room has a turn time configured).

```
// Timer visibility/enable condition:
const gameStarted = startRoll.isFinalized && roomPlayers.length >= 2;
const shouldShowTimer = turnTimeSeconds > 0 && gameStarted && !gameOver;

useTurnTimer:     enabled: shouldShowTimer && isMyTurn  (countdown only on my turn)
showTimer:        {shouldShowTimer}  (visible to BOTH players always)
opponentTimeout:  enabled: shouldShowTimer && !isMyTurn && startRoll.isFinalized
```

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ChessGame.tsx` | Update timer conditions to include private mode |
| `src/pages/CheckersGame.tsx` | Update timer conditions to include private mode |
| `src/pages/BackgammonGame.tsx` | Update timer conditions to include private mode |
| `src/pages/DominosGame.tsx` | Update timer conditions to include private mode |
| `src/pages/LudoGame.tsx` | Update timer conditions to include private mode |

### Changes per File

For each game page:

1. **Extract `isPrivate` and `turnTimeSeconds` from `useRoomMode`**:
```typescript
const { 
  mode: roomMode, 
  isRanked: isRankedGame, 
  isPrivate, 
  turnTimeSeconds: roomTurnTime,
  isLoaded: modeLoaded 
} = useRoomMode(roomPda);
```

2. **Define timer visibility based on `turnTimeSeconds > 0`**:
```typescript
// Effective turn time: prefer room's turn time, fall back to rankedGate
const effectiveTurnTime = roomTurnTime || rankedGate.turnTimeSeconds || 0;

// Timer should show when turn time is configured and game has started
const gameStarted = startRoll.isFinalized && roomPlayers.length >= 2;
const shouldShowTimer = effectiveTurnTime > 0 && gameStarted && !gameOver;
```

3. **Update `useTurnTimer` enabled condition**:
```typescript
const turnTimer = useTurnTimer({
  turnTimeSeconds: effectiveTurnTime,
  // Timer counts down only on your turn, but enabled for ranked/private
  enabled: shouldShowTimer && isActuallyMyTurn,
  isMyTurn: isActuallyMyTurn,
  onTimeExpired: handleTurnTimeout,
  roomId: roomPda,
});
```

4. **Update `TurnStatusHeader` showTimer - NOT gated by canPlay**:
```typescript
<TurnStatusHeader
  isMyTurn={isMyTurn}
  activePlayer={activePlayer}
  players={turnPlayers}
  myAddress={address}
  remainingTime={shouldShowTimer ? turnTimer.remainingTime : undefined}
  showTimer={shouldShowTimer}  // BOTH players see the timer
/>
```

5. **Update `useOpponentTimeoutDetection` to include private mode**:
```typescript
const opponentTimeout = useOpponentTimeoutDetection({
  roomPda: roomPda || "",
  // Enable for ranked/private when it's NOT my turn
  enabled: shouldShowTimer && !isActuallyMyTurn && startRoll.isFinalized,
  isMyTurn: isActuallyMyTurn,
  turnTimeSeconds: effectiveTurnTime,
  myWallet: address,
  onOpponentTimeout: handleOpponentTimeoutDetected,
  onAutoForfeit: handleOpponentAutoForfeit,
});
```

## Behavior Changes

| Scenario | Before | After |
|----------|--------|-------|
| Private room (10s turn time) | No timer visible | Timer visible to both players |
| Ranked game, opponent's turn | Timer hidden | Timer visible (showing opponent's countdown) |
| Casual game (0s turn time) | No timer | No timer (correct) |
| 3 missed turns in private | Forfeit not triggered | Forfeit triggered correctly |

## Acceptance Tests

1. **Private room (10s)**: Create private room with 10s turn time, both players join - timer visible on both devices
2. **Timer visible during opponent's turn**: When opponent is thinking, I still see the countdown
3. **Ranked mode unchanged**: Same behavior as before (timer works)
4. **Casual mode unchanged**: When `turnTimeSeconds = 0`, no timer shown
5. **3 missed turns = forfeit**: Works in private mode - opponent is notified via WebRTC
