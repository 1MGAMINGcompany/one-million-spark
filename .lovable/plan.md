

# Fix Chess Timeout UX: Timer Jump + Board Freeze

## Changes

### 1. useTurnTimer.ts (line 63-67) — Eliminate timer "jump"

When `turnStartedAt` changes (new turn detected), immediately set `remainingTime` to the full `turnTimeSeconds`. This prevents the "0 then 10" visual glitch. The next 1-second tick will recompute from the server anchor (at most 1s off).

```typescript
useEffect(() => {
  if (turnStartedAt) {
    hasExpiredRef.current = false;
    setRemainingTime(turnTimeSeconds); // snap to full time immediately
  }
}, [turnStartedAt, turnTimeSeconds]);
```

### 2. ChessGame.tsx — Snap `dbTurnStartedAt` in all timeout/turn-change handlers

The timer derives from `dbTurnStartedAt`. Currently, only `turnOverrideWallet` is set after timeouts -- the timer anchor is never updated, so the timer shows stale/expired values until the next full poll cycle.

**Line 582 (self-timeout handler):** Add after `setTurnOverrideWallet`:
```typescript
setDbTurnStartedAt(new Date().toISOString());
```

**Line 717-718 (polling timeout handler):** Add after `setTurnOverrideWallet`:
```typescript
setDbTurnStartedAt(new Date().toISOString());
```

**Line 750-751 (polling turn-change handler):** Replace `turnTimer.resetTimer()` with:
```typescript
setDbTurnStartedAt(data?.session?.turn_started_at || new Date().toISOString());
```

**Line 819-820 (visibility handler):** Replace `turnTimer.resetTimer()` with:
```typescript
setDbTurnStartedAt(data?.session?.turn_started_at || new Date().toISOString());
```

### 3. ChessGame.tsx line 780 — Remove `turnOverrideWallet` from polling deps

`turnOverrideWallet` is in the polling effect's dependency array. Every time it changes (after a timeout), the effect re-creates, restarting the interval. During this restart gap, the next poll is delayed. Removing it prevents interval disruption.

Change line 780 from:
```
address, turnOverrideWallet, activeTurnAddress, roomPlayers,
```
to:
```
address, activeTurnAddress, roomPlayers,
```

The polling callback already reads `turnOverrideWallet` via the closure at comparison time -- it doesn't need it as a dep since we compare against `activeTurnAddress` which IS in deps.

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `src/hooks/useTurnTimer.ts` | 63-67 | Add `setRemainingTime(turnTimeSeconds)` on turnStartedAt change |
| `src/pages/ChessGame.tsx` | 582 | Add `setDbTurnStartedAt(now)` in self-timeout handler |
| `src/pages/ChessGame.tsx` | 717-718 | Add `setDbTurnStartedAt(now)` in polling timeout handler |
| `src/pages/ChessGame.tsx` | 750-751 | Set `dbTurnStartedAt` from server value in polling turn-change |
| `src/pages/ChessGame.tsx` | 819-820 | Set `dbTurnStartedAt` from server value in visibility handler |
| `src/pages/ChessGame.tsx` | 780 | Remove `turnOverrideWallet` from polling effect deps |

## Verification

1. Create ranked chess game with 10s turns
2. Let White's timer expire -- Black sees timer start at 10s (no jump from 0)
3. Black can move immediately (board is not frozen)
4. Let White timeout twice in a row -- Black can still move after each one
5. Timer is only visible to the player whose turn it is

