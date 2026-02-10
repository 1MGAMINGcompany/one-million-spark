
# Fix: Stop Polling From Overwriting Timer Anchor

## Root Cause

`src/pages/ChessGame.tsx` line 680 runs unconditionally on every poll:
```typescript
setDbTurnStartedAt(session?.turn_started_at || null);
```

This overwrites the local timer anchor (set to NOW by timeout/turn-change handlers) with the server's `turn_started_at` (which is the moment the timeout was APPLIED, not when polling detected it). This eats into the new player's turn time and causes timer visual jumps.

## Fix 1: ChessGame.tsx line 680 — Move dbTurnStartedAt update inside turn-change detection

Remove the unconditional `setDbTurnStartedAt` on line 680 and only update it when a turn change is actually detected.

**Before (line 680):**
```typescript
setDbTurnStartedAt(session?.turn_started_at || null);
```

**After:**
```typescript
// DO NOT unconditionally update dbTurnStartedAt here.
// It is only updated inside the turn-change handlers below
// to prevent overwriting the local timer anchor.
```

This ensures the timer anchor is only set:
- In the timeout handler (line 719): `setDbTurnStartedAt(new Date().toISOString())`
- In the turn-change handler (line 752): `setDbTurnStartedAt(data?.session?.turn_started_at || new Date().toISOString())`
- In the self-timeout handler (line 583): `setDbTurnStartedAt(new Date().toISOString())`
- In the visibility handler (line 821): `setDbTurnStartedAt(data?.session?.turn_started_at || new Date().toISOString())`

All of these fire only on actual state transitions, not every 3 seconds.

## Fix 2: useTurnTimer.ts — Already fixed (snap effect)

The snap effect from the previous edit (line 66: `setRemainingTime(turnTimeSeconds)`) is correct and stays. With Fix 1 applied, `turnStartedAt` will only change on actual turn transitions, so the snap effect will only fire once per turn (not every poll).

## Files Modified

| File | Line | Change |
|------|------|--------|
| `src/pages/ChessGame.tsx` | 680 | Remove unconditional `setDbTurnStartedAt(session?.turn_started_at)` |

## Why this fixes both issues

1. **Timer flash ("0 then 10")**: Without the unconditional overwrite, `turnStartedAt` only changes when the turn actually changes. The snap effect fires once, shows 10s, and subsequent ticks compute correctly from a stable anchor.

2. **Board frozen after timeout**: Without the overwrite, BSBA's timer anchor stays at the value set by the timeout handler (NOW), giving the full 10 seconds. The server's `turn_started_at` (set earlier) no longer silently shortens the turn.

## Verification

1. Create ranked chess game with 10s turns
2. Let White timeout once -- Black sees timer start at 10s (no jump), can move immediately
3. Let White timeout twice -- Black still gets full 10s each time and can move
4. No timer visible during opponent's turn
5. No "0 then 10" flash at any point
