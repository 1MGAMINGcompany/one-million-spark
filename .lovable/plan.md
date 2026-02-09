
# Fix: Anchor Turn Timer to Server Time

## Problem

The timer counts down from a client-side value and resets every time `isMyTurn` changes. Since polling can trigger `isMyTurn` re-evaluations, the timer gets spurious resets mid-countdown, appearing to jump around. The client timer and the server's `turn_started_at` are fundamentally disconnected.

## Solution

Replace the client-side decrementing counter with a server-anchored calculation:

```
remainingTime = turnTimeSeconds - (Date.now() - turn_started_at) / 1000
```

This makes the timer immune to polling resets and keeps both players perfectly in sync.

## Technical Changes

### 1. Update `useTurnTimer` interface and implementation (`src/hooks/useTurnTimer.ts`)

**New prop**: Add `turnStartedAt: string | null` to `UseTurnTimerOptions`.

**Replace countdown logic**: Instead of `setInterval` that decrements `prev - 1`, use a `setInterval` that computes remaining time from the server timestamp on every tick:

```typescript
intervalRef.current = setInterval(() => {
  if (!turnStartedAt) return;
  const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
  const remaining = Math.max(0, turnTimeSeconds - elapsed);
  setRemainingTime(Math.ceil(remaining));

  if (remaining <= 0 && !hasExpiredRef.current) {
    hasExpiredRef.current = true;
    clearTimerInterval();
    setTimeout(() => onTimeExpired?.(), 0);
  }
}, 1000);
```

**Remove `isMyTurn` reset effect**: The effect at line 91-95 that calls `resetTimer()` whenever `isMyTurn` changes is no longer needed -- the timer is always derived from `turnStartedAt`. When `turnStartedAt` changes (real turn transition), the timer naturally resets.

**Remove `resetTimer` and related methods**: `resetTimer`, `pauseTimer`, `resumeTimer` become unnecessary since the timer is purely derived from the server timestamp. Keep the interface shape but make them no-ops to avoid breaking callers.

### 2. Pass `turnStartedAt` from game pages to `useTurnTimer`

Each game page already has access to `turn_started_at` from the game session data. Pass it through to the hook.

**Files affected** (add `turnStartedAt` prop):
- `src/pages/ChessGame.tsx`
- `src/pages/CheckersGame.tsx`
- `src/pages/BackgammonGame.tsx`
- `src/pages/DominosGame.tsx`
- `src/pages/LudoGame.tsx`

### 3. Remove polling dependency on `turnTimer.resetTimer`

Since the timer no longer needs manual resets, remove `turnTimer.resetTimer` from polling effect dependency arrays in all 5 game pages.

## Summary of changes

| File | Change |
|------|--------|
| `src/hooks/useTurnTimer.ts` | Add `turnStartedAt` prop; replace decrement countdown with server-anchored calculation; remove `isMyTurn`-triggered reset effect |
| `src/pages/ChessGame.tsx` | Pass `turnStartedAt` to `useTurnTimer`; remove `turnTimer.resetTimer` from polling deps |
| `src/pages/CheckersGame.tsx` | Same |
| `src/pages/BackgammonGame.tsx` | Same |
| `src/pages/DominosGame.tsx` | Same |
| `src/pages/LudoGame.tsx` | Same |

No database changes needed -- the RPC fix from the previous migration is working correctly (timeouts at ~12s = 10s + 2s grace).
