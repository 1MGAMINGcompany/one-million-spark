

## Fix Plan: Turn Timer Enforcement for Ranked Multiplayer Games

### Problem Summary
When the turn timer expires for a player in a ranked multiplayer game:
1. The game gets stuck - the turn doesn't switch to the opponent
2. No `turn_timeout` moves are being recorded in the database
3. The waiting player has no way to know their opponent timed out
4. After 3 missed turns, auto-forfeit should trigger but doesn't

### Build Errors (Must Fix First)
Two TypeScript errors are blocking the build:

**Error 1:** `useTurnTimer` hook is being called with `activeTurnWallet` which doesn't exist:
```typescript
// Current (broken):
useTurnTimer({
  ...
  activeTurnWallet: (game.turn() === 'w' ? roomPlayers[0] : roomPlayers[1]) || null,
})
```

**Error 2:** `DiceRollStart` component is receiving props that don't exist in its interface:
```typescript
// Current (broken):
<DiceRollStart
  isRankedGame={isRankedGame}  // Not in props
  bothReady={rankedGate.bothReady}  // Not in props
  ...
/>
```

### Root Cause Analysis
The turn timer system has a fundamental design issue:
1. `useTurnTimer` only fires `onTimeExpired` when `isMyTurn === true`
2. When Player A's timer expires on Player A's device, Player A handles it
3. But if Player A goes offline or has a stale tab, Player B has no way to know
4. The database `turn_started_at` + `turn_time_seconds` should be the source of truth

### Solution Overview

#### Phase 1: Fix Build Errors
1. Remove `activeTurnWallet` from `useTurnTimer` calls (it's not in the interface)
2. Remove `isRankedGame` and `bothReady` from `DiceRollStart` (they're not in the interface)

#### Phase 2: Implement Opponent Timeout Detection
Add a polling mechanism that checks if the opponent has timed out based on database state:
- Poll `game_sessions.turn_started_at` + `turn_time_seconds`
- If `now() > turn_started_at + turn_time_seconds` AND it's opponent's turn:
  - Increment their missed turn counter
  - Submit `turn_timeout` move to switch turns
  - Show toast notification "Opponent missed their turn (1/3)"
  - If 3 missed turns, trigger auto-forfeit

#### Phase 3: Add WebRTC/Realtime Timeout Notification
When a player times out on their device:
- Broadcast `turn_timeout` message via WebRTC/Realtime
- Receiving player updates their local state and shows notification

---

## Technical Implementation

### File Changes Required

#### 1. src/hooks/useTurnTimer.ts
**No changes needed** - interface is correct, the game files are passing extra props

#### 2. src/pages/ChessGame.tsx
- Remove `activeTurnWallet` from `useTurnTimer` call (line 589)
- Remove `isRankedGame` and `bothReady` from `DiceRollStart` (lines 1411-1412)
- Add opponent timeout detection via polling

#### 3. src/pages/CheckersGame.tsx
- Remove `activeTurnWallet` from `useTurnTimer` call (line 509)
- Remove `isRankedGame` and `bothReady` from `DiceRollStart` (lines 1286-1287)
- Add opponent timeout detection via polling

#### 4. New Hook: src/hooks/useOpponentTimeoutDetection.ts
Create a hook that:
- Polls `game_sessions` every 2-3 seconds when it's opponent's turn
- Checks if `now() > turn_started_at + turn_time_seconds`
- If expired, calls `handleOpponentTimeout` callback

```typescript
interface UseOpponentTimeoutOptions {
  roomPda: string;
  enabled: boolean;
  isMyTurn: boolean;
  turnTimeSeconds: number;
  onOpponentTimeout: () => void;
}
```

### Expected Flow After Fix

```text
Game in progress, it's Player A's turn
    ↓
Player A's 10-second timer expires
    ↓
EITHER:
  - Player A's device fires onTimeExpired → submits turn_timeout → switches turn
  OR
  - Player B's device detects via polling → submits turn_timeout → switches turn
    ↓
Database updated: current_turn_wallet = Player B
    ↓
If 3 misses: auto_forfeit triggered
    ↓
Player B sees toast: "Opponent missed their turn (1/3)"
```

### Database RPC Enhancement (Optional)
The existing `submit_game_move` RPC already supports `turn_timeout` moves. We may want to add a dedicated `record_turn_timeout` RPC that:
- Validates the timeout is legitimate (turn_started_at + turn_time_seconds < now())
- Atomically increments missed turn counter
- Updates current_turn_wallet
- Prevents double-submission

### What This Fixes
1. ✅ Turn switches when timer expires
2. ✅ 3 consecutive misses triggers auto-forfeit
3. ✅ Waiting player gets notified when opponent misses turn
4. ✅ Works even if one player goes offline

### What Stays the Same
- Forfeit payout logic (unchanged)
- Dice roll logic (unchanged)
- Ludo (uses different multi-player system)
- Start roll mechanism (unchanged)

