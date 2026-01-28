

# Validated Plan: Fix Private Room Ready Gate + Timer Issues

## Summary

After reviewing the code, the proposed plan is **mostly correct** but needs one addition. The core issue is that `start_roll_finalized` is used as a fallback to determine "both ready" in TWO places, creating a false positive loop.

---

## Root Cause Confirmed

Two files use `start_roll_finalized` as a "both ready" fallback:

1. **`supabase/functions/game-session-get/index.ts` (line 104)**
   ```typescript
   const bothAccepted = fromAcceptances || fromSessionFlags || fromStartRoll;
   ```

2. **`src/hooks/useRankedReadyGate.ts` (line 90)**
   ```typescript
   const bothReady = serverBothAccepted || (sessionComplete && p1Ready && p2Ready) || startRollFinalized;
   ```

When `compute_start_roll` is called before Player 2 properly accepts (in private rooms), both files incorrectly report "both ready", causing timers to fire prematurely.

---

## Validated Fixes

### Fix 1: `game-session-get` Edge Function
**File:** `supabase/functions/game-session-get/index.ts`

Remove `fromStartRoll` from `bothAccepted`:
```typescript
// Line 104 - BEFORE:
const bothAccepted = fromAcceptances || fromSessionFlags || fromStartRoll;

// Line 104 - AFTER:
const bothAccepted = fromAcceptances || fromSessionFlags;
```

**Why safe:** `start_roll_finalized` is a RESULT of being ready, not a CAUSE. If both were truly ready, the flags would already be set.

### Fix 2: `useRankedReadyGate` Hook
**File:** `src/hooks/useRankedReadyGate.ts`

Remove `startRollFinalized` from `bothReady`:
```typescript
// Line 90 - BEFORE:
const bothReady = serverBothAccepted || (sessionComplete && p1Ready && p2Ready) || startRollFinalized;

// Line 90 - AFTER:
const bothReady = serverBothAccepted || (sessionComplete && p1Ready && p2Ready);
```

**Why safe:** Same reasoning - we want actual acceptance state, not derived state.

### Fix 3: Add `bothReady` Guard to `handleTurnTimeout`
**Files:** All 5 game files

Add explicit early return in `handleTurnTimeout`:
```typescript
const handleTurnTimeout = useCallback((timedOutWalletArg?: string | null) => {
  // NEW: Gate on bothReady - NEVER process timeout before game is ready
  if (!rankedGate.bothReady) {
    console.log("[handleTurnTimeout] Blocked - game not ready");
    return;
  }
  if (gameOver || !address || !roomPda) return;
  // ... rest of logic
}, [rankedGate.bothReady, gameOver, address, roomPda, ...]);
```

---

## What About JoinRoom.tsx?

The current `JoinRoom.tsx` is a **placeholder page** that shows "Coming Soon". Private room joins happen directly on the game page via invite links (e.g., `/chess/ROOM_PDA`). The `record_acceptance` RPC is already called in `useSolanaRooms.ts` when joining, which sets `p2_ready = true`.

**No changes needed to JoinRoom.tsx.**

---

## Why This Won't Break Anything

| Concern | Answer |
|---------|--------|
| Will casual games break? | No - `useRankedReadyGate` returns `bothReady: true` for casual games (line 326-337) |
| Will ranked games break? | No - they rely on `p1_ready && p2_ready` flags which are set by `record_acceptance` |
| Will existing private games break? | No - the fix ensures timers only start when BOTH players are truly ready |
| Will start roll logic break? | No - `compute_start_roll` still works, but its result won't falsely trigger "both ready" |

---

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/game-session-get/index.ts` | Remove `fromStartRoll` from line 104 |
| `src/hooks/useRankedReadyGate.ts` | Remove `startRollFinalized` from line 90 |
| `src/pages/ChessGame.tsx` | Add `rankedGate.bothReady` guard in `handleTurnTimeout` |
| `src/pages/CheckersGame.tsx` | Same |
| `src/pages/BackgammonGame.tsx` | Same |
| `src/pages/DominosGame.tsx` | Same |
| `src/pages/LudoGame.tsx` | Same |

---

## Testing After Implementation

1. Create a private chess room
2. Verify timer does NOT start until second player joins AND accepts
3. Verify `p2_ready` is TRUE in database after join
4. Verify both players see synchronized countdown
5. Verify timeout only fires on active player's device

