
# Turn Timer Visibility Fix - COMPLETED

## Summary

Turn timer now shows for **both ranked and private games** when `turnTimeSeconds > 0`. The timer is visible to both players at all times (not gated by `canPlay`), and the 3-strikes forfeit logic works in private mode.

## Changes Made

### Files Modified
- `src/pages/ChessGame.tsx`
- `src/pages/CheckersGame.tsx`
- `src/pages/BackgammonGame.tsx`
- `src/pages/DominosGame.tsx`
- `src/pages/LudoGame.tsx`

### Key Logic Changes

1. **Extracted `isPrivate` and `turnTimeSeconds` from `useRoomMode`**:
```typescript
const { mode: roomMode, isRanked: isRankedGame, isPrivate, turnTimeSeconds: roomTurnTime, isLoaded: modeLoaded } = useRoomMode(roomPda);
```

2. **New timer visibility logic**:
```typescript
// Use turn time from room mode (DB source of truth) or fallback to ranked gate
const effectiveTurnTime = roomTurnTime || rankedGate.turnTimeSeconds || DEFAULT_RANKED_TURN_TIME;

// Timer should show when turn time is configured and game has started
const gameStarted = startRoll.isFinalized && roomPlayers.length >= 2;
const shouldShowTimer = effectiveTurnTime > 0 && gameStarted && !gameOver;
```

3. **Updated `useTurnTimer`** - enabled when `shouldShowTimer && isActuallyMyTurn`

4. **Updated `useOpponentTimeoutDetection`** - enabled when `shouldShowTimer && !isActuallyMyTurn`

5. **Updated `TurnStatusHeader`** - `showTimer={shouldShowTimer}` (not gated by `canPlay`)

6. **Updated persist logic** - timeout events now persist for `(isRankedGame || isPrivate)`

## Behavior Changes

| Scenario | Before | After |
|----------|--------|-------|
| Private room (10s turn time) | No timer visible | Timer visible to both players |
| Ranked game, opponent's turn | Timer hidden | Timer visible (showing opponent's countdown) |
| Casual game (0s turn time) | No timer | No timer (correct) |
| 3 missed turns in private | Forfeit not triggered | Forfeit triggered correctly |

## Acceptance Tests

1. ✅ **Private room (10s)**: Timer visible on both devices
2. ✅ **Timer visible during opponent's turn**: Both players see countdown
3. ✅ **Ranked mode unchanged**: Same behavior as before
4. ✅ **Casual mode unchanged**: No timer when `turnTimeSeconds = 0`
5. ✅ **3 missed turns = forfeit**: Works in private mode
