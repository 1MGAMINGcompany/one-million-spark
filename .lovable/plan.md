

# Fix Turn Timer Display + Enforcement (No Polling, No Double Timeouts)

## Problem Summary

The turn timer currently has two major issues:

1. **Display Problem**: When it's NOT my turn, the timer UI freezes at the last value instead of showing the opponent's active countdown. Both players should see the SAME countdown value.

2. **Enforcement Problem**: The `useTurnTimer` hook and timeout detection could potentially run simultaneously on both devices, causing confusion or double timeouts.

## Root Cause

- `useTurnTimer` only ticks when `isMyTurn === true` — this is correct for **enforcement**
- But there's no separate **display timer** that calculates remaining time from `turn_started_at` timestamp
- The UI passes `turnTimer.remainingTime` directly, which freezes when not your turn

## Solution Overview

1. **Create `useTurnCountdownDisplay` hook** — display-only timer based on DB timestamp
2. **Keep `useTurnTimer` for enforcement** — only runs on active player's device
3. **Update all 5 game files** to use display timer for UI, enforcement timer for callbacks
4. **Add proper gating** — `bothReady` and `gameStarted` checks everywhere

---

## File Changes

### Part 1: New Hook — `src/hooks/useTurnCountdownDisplay.ts`

Creates a **display-only** countdown timer that calculates remaining time from server truth (`turn_started_at` + `turn_time_seconds`). This hook:

- Ticks locally every 1 second for smooth UI
- Recomputes immediately when `turnStartedAt` changes (turn switch)
- Does NOT poll the database — uses values passed from existing polling/realtime
- Returns `null` when disabled or missing data

```typescript
interface UseTurnCountdownDisplayOptions {
  /** ISO timestamp when current turn started (from DB) */
  turnStartedAt: string | null | undefined;
  /** Turn time limit in seconds */
  turnTimeSeconds: number;
  /** Whether display is enabled */
  enabled: boolean;
}

interface UseTurnCountdownDisplayResult {
  /** Remaining time for current turn, or null if not active */
  displayRemainingTime: number | null;
  /** Low time warning (<=30s) */
  isLowTime: boolean;
  /** Critical time (<=10s) */
  isCriticalTime: boolean;
}
```

**Logic**:
1. If `!enabled || !turnStartedAt || turnTimeSeconds <= 0` → return `null`
2. Compute: `remaining = max(0, turnTimeSeconds - floor((Date.now() - turnStartedAtMs) / 1000))`
3. Use `setInterval(1000)` to update every second
4. Clear and recompute when `turnStartedAt` changes

### Part 2: Update Game Files

Update all 5 game files to:
- Add `turn_started_at` tracking from DB polling/session
- Use `useTurnCountdownDisplay` for UI display
- Keep `useTurnTimer` strictly for enforcement (with proper gates)

#### Files to Update:
- `src/pages/ChessGame.tsx`
- `src/pages/CheckersGame.tsx`
- `src/pages/BackgammonGame.tsx` (already has `turnStartedAt` state)
- `src/pages/DominosGame.tsx`
- `src/pages/LudoGame.tsx`

#### Changes per file:

**1. Add `turnStartedAt` state** (ChessGame, CheckersGame, DominosGame, LudoGame need this):
```typescript
const [turnStartedAt, setTurnStartedAt] = useState<string | null>(null);
```

**2. Update polling to track `turn_started_at`** (where not already done):
```typescript
// In existing DB poll:
const dbTurnStartedAt = data?.session?.turn_started_at;
if (dbTurnStartedAt && dbTurnStartedAt !== turnStartedAt) {
  setTurnStartedAt(dbTurnStartedAt);
}
```

**3. Add display timer hook**:
```typescript
import { useTurnCountdownDisplay } from "@/hooks/useTurnCountdownDisplay";

// Define gameStarted consistently
const gameStarted = startRoll.isFinalized && roomPlayers.length >= requiredPlayers;

// Display timer - shows ACTIVE player's remaining time on BOTH devices
const displayTimer = useTurnCountdownDisplay({
  turnStartedAt,
  turnTimeSeconds: effectiveTurnTime,
  enabled: shouldShowTimer && rankedGate.bothReady && gameStarted && !gameOver,
});
```

**4. Update enforcement timer gates**:
```typescript
// Enforcement timer - ONLY runs on active player's device
const turnTimer = useTurnTimer({
  turnTimeSeconds: effectiveTurnTime,
  enabled: shouldShowTimer && isActuallyMyTurn && rankedGate.bothReady && gameStarted && !gameOver,
  isMyTurn: isActuallyMyTurn,
  onTimeExpired: handleTurnTimeout,
  roomId: roomPda,
});
```

**5. Update TurnStatusHeader to use display timer**:
```typescript
<TurnStatusHeader
  isMyTurn={isActuallyMyTurn}
  activePlayer={...}
  players={turnPlayers}
  myAddress={address}
  remainingTime={displayTimer.displayRemainingTime ?? undefined}
  showTimer={displayTimer.displayRemainingTime != null}
/>
```

**6. Add `bothReady` guard to `handleTurnTimeout`**:
```typescript
const handleTurnTimeout = useCallback(() => {
  // Gate on bothReady - NEVER process timeout before game is ready
  if (!rankedGate.bothReady || !gameStarted) {
    console.log("[handleTurnTimeout] Blocked - game not ready");
    return;
  }
  if (gameOver || !address || !roomPda || !isActuallyMyTurn) return;
  // ... rest of timeout logic
}, [gameOver, address, roomPda, isActuallyMyTurn, rankedGate.bothReady, gameStarted, ...]);
```

### Part 3: Ludo Multi-Player Considerations

For Ludo (2, 3, or 4 players):
- Timer shows the **current active player's** remaining time regardless of player count
- `isActuallyMyTurn = myPlayerIndex >= 0 && myPlayerIndex === currentPlayerIndex && !gameOver`
- `requiredPlayers` comes from `session.max_players` (2, 3, or 4)
- Same display hook works — just needs accurate `turnStartedAt` from DB

---

## Technical Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER (Database)                        │
│  turn_started_at: "2026-01-28T20:50:00Z"                       │
│  turn_time_seconds: 60                                          │
│  current_turn_wallet: "ABC..."                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                 │
          ▼                                 ▼
┌─────────────────────┐           ┌─────────────────────┐
│   PLAYER A (ABC)    │           │   PLAYER B (XYZ)    │
│   isMyTurn = TRUE   │           │   isMyTurn = FALSE  │
│                     │           │                     │
│ useTurnTimer:       │           │ useTurnTimer:       │
│   enabled = TRUE    │           │   enabled = FALSE   │
│   → TICKS + ENFORCE │           │   → PAUSED          │
│                     │           │                     │
│ useTurnCountdown:   │           │ useTurnCountdown:   │
│   enabled = TRUE    │           │   enabled = TRUE    │
│   → DISPLAY: 45s    │           │   → DISPLAY: 45s    │
│                     │           │                     │
│ BOTH SEE: 0:45      │           │ BOTH SEE: 0:45      │
└─────────────────────┘           └─────────────────────┘
```

---

## `gameStarted` Definition by Game Type

| Game | gameStarted condition |
|------|----------------------|
| Chess | `startRoll.isFinalized && roomPlayers.length >= 2` |
| Checkers | `startRoll.isFinalized && roomPlayers.length >= 2` |
| Backgammon | `startRoll.isFinalized && roomPlayers.length >= 2` |
| Dominos | `startRoll.isFinalized && roomPlayers.length >= 2` |
| Ludo | `startRoll.isFinalized && roomPlayers.length >= requiredPlayers` |

For Ludo, `requiredPlayers = session.max_players` (2, 3, or 4).

---

## Testing Checklist

| Scenario | Expected Behavior |
|----------|-------------------|
| White's turn (Chess) | BOTH devices show same countdown decreasing |
| White makes move | Timer resets, BOTH devices show Black's countdown |
| Opponent times out | Only ONE timeout event in DB per missed turn |
| Timer before both ready | No timer visible, no timeout callbacks |
| Ludo 4-player | Timer shows active player's time, switches on turn change |
| Game over | Timer hidden, no callbacks fire |

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useTurnCountdownDisplay.ts` | **NEW** — display-only timer from DB timestamp |
| `src/hooks/useTurnTimer.ts` | **UNCHANGED** — enforcement only |
| `src/pages/ChessGame.tsx` | Add `turnStartedAt` state, display timer, gate enforcement |
| `src/pages/CheckersGame.tsx` | Add `turnStartedAt` state, display timer, gate enforcement |
| `src/pages/BackgammonGame.tsx` | Use existing `turnStartedAt`, add display timer, gate enforcement |
| `src/pages/DominosGame.tsx` | Add `turnStartedAt` state, display timer, gate enforcement |
| `src/pages/LudoGame.tsx` | Add `turnStartedAt` state, display timer, gate enforcement, multi-player support |

