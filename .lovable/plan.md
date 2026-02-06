
# Fix Plan: Turn Time Display, Desktop Bear Off Button & Turn Timer Forfeit

## Summary of Issues Found

### Issue 1: Turn Time Not Showing in Room List (Shows "—")
**Location:** Screenshot shows `Clock` icon with "—" instead of "10s"

**Root Cause:** The database session for `AFqKJMHtjBz5nTvLkUSYR66L4dqMHzvqgeX3q7y8DcYe` (room #1770341757994 visible in screenshot) has `turn_time_seconds: 10` in the DB, but the Room PDA in the screenshot is a DIFFERENT room being shown.

Looking at the DB query results:
```text
room_pda: BqsuTuDFxQESLKjsx3QA1eREBhe1SWG2FUAwc54sJcZ - turn_time_seconds: 10
room_pda: AFqKJMHtjBz5nTvLkUSYR66L4dqMHzvqgeX3q7y8DcYe - turn_time_seconds: 10
```

The enrichment in `useSolanaRooms.ts` queries the database and maps by `room_pda`. The issue is likely that the room PDA format from Solana vs. what's stored in `game_sessions` doesn't match.

**Fix:** Add debug logging to verify matching and ensure the enrichment query actually finds sessions.

### Issue 2: Missing Bear Off Button on Desktop (CRITICAL)
**Location:** Lines 2589-2618 in `BackgammonGame.tsx`

The Bear Off zone IS present in the desktop layout, but comparing to `BackgammonAI.tsx` (lines 1183-1212), I can see the key difference:

**BackgammonAI (working):**
- Bear Off zone has a clear clickable area with proper styling
- Uses `canBearOff(gameState, "player")` to show status

**BackgammonGame (multiplayer):**
- Bear Off zone exists but uses `canBearOff(gameState, myRole)`
- The zone is smaller and less prominent
- Need to add an explicit **"Bear Off" button** in the controls row like mobile has

**Fix:** Add a more prominent Bear Off button in the desktop controls area (lines 2624-2638), matching what mobile has.

### Issue 3: Turn Timer Not Triggering Forfeit
**Location:** Lines 1182-1188 in `BackgammonGame.tsx`

The `useTurnTimer` hook is correctly configured:
```typescript
const turnTimer = useTurnTimer({
  turnTimeSeconds: effectiveTurnTime,  // 10 seconds
  enabled: isRankedGame && (canPlay || startRoll.isFinalized) && !gameOver,
  isMyTurn: effectiveIsMyTurn,
  onTimeExpired: handleTurnTimeout,
  roomId: roomPda,
});
```

**Potential causes:**
1. The `mid-turn guard` at lines 1072-1079 prevents timeout if `dice.length > 0 && remainingMoves.length > 0`
2. If you rolled dice but didn't finish all moves, the timer WON'T fire
3. This is intentional to prevent accidental forfeits mid-move

**However**, looking at the DB data:
```text
turn_started_at: 2026-02-06 01:44:33.743588+00
```

If the current time was 01:48+ (logs show activity until 01:48), that's 4+ minutes since last turn started. The 10-second timer should have fired many times.

**Real Issue:** The `effectiveIsMyTurn` might be `false` even when it's actually your turn, OR the timer interval stopped.

Looking at line 1184-1185:
```typescript
enabled: isRankedGame && (canPlay || startRoll.isFinalized) && !gameOver,
isMyTurn: effectiveIsMyTurn,
```

The timer only counts down when `isMyTurn: true`. If `effectiveIsMyTurn` becomes `false` for any reason (polling updates, state desync), the timer pauses.

**Fix:** Add more aggressive timer reset and ensure `effectiveIsMyTurn` correctly reflects turn state from DB. Also ensure timer doesn't silently pause.

## Implementation Plan

### Step 1: Fix Desktop Bear Off Button (Priority: HIGH)
**File:** `src/pages/BackgammonGame.tsx`

Add a larger, more visible Bear Off button in the desktop controls row (around line 2625):

```typescript
{/* Bear Off button - desktop - show when all checkers in home */}
{canBearOff(gameState, myRole) && !gameOver && (
  <Button 
    variant={validMoves.includes(-2) ? "gold" : "outline"}
    size="lg"
    className={cn(
      "min-w-[140px]",
      validMoves.includes(-2) && "animate-pulse shadow-[0_0_30px_-8px_hsl(45_93%_54%_/_0.5)]"
    )}
    onClick={() => validMoves.includes(-2) && handlePointClick(-2)}
    disabled={!validMoves.includes(-2)}
  >
    <Trophy className="w-4 h-4 mr-2" />
    Bear Off ({myRole === "player" ? gameState.bearOff.player : gameState.bearOff.ai}/15)
  </Button>
)}
```

### Step 2: Fix Turn Timer Debug Logging
**File:** `src/hooks/useTurnTimer.ts`

Add more verbose logging when timer state changes to debug why it's not firing:

```typescript
// Add effect to log timer state changes
useEffect(() => {
  console.log(`[useTurnTimer] State: enabled=${enabled}, isMyTurn=${isMyTurn}, isPaused=${isPaused}, remaining=${remainingTime}s, roomId=${roomId?.slice(0, 8)}`);
}, [enabled, isMyTurn, isPaused, remainingTime, roomId]);
```

### Step 3: Fix Room List Turn Time Display
**File:** `src/hooks/useSolanaRooms.ts`

The enrichment logic looks correct, but add more diagnostic logging to understand why no sessions are matching:

```typescript
// After fetching sessions, log what we got
console.log("[RoomList] Enrichment check:", {
  fetchedRoomPdas: roomPdas.map(p => p.slice(0, 12)),
  dbSessionPdas: sessions?.map(s => s.room_pda.slice(0, 12)) || [],
  matchCount: turnTimeMap.size,
});
```

### Step 4: Ensure Timer Continues When Tab is Visible
**File:** `src/pages/BackgammonGame.tsx`

In the visibility change handler, also resume the timer:

```typescript
// When tab becomes visible, resume timer if it was paused
if (document.visibilityState === 'visible') {
  if (turnTimer.isPaused) {
    turnTimer.resumeTimer();
  }
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/BackgammonGame.tsx` | Add prominent Bear Off button in desktop controls row, add timer resume on visibility |
| `src/hooks/useTurnTimer.ts` | Add verbose state logging |
| `src/hooks/useSolanaRooms.ts` | Add enrichment diagnostic logging |

## Why This Will Work

1. **Bear Off Button:** Adding an explicit button in the controls row makes the action discoverable, matching the mobile experience where there's a full-width "Tap to Bear Off" button.

2. **Timer Logging:** Will help diagnose WHY the timer isn't firing - whether it's `enabled=false`, `isMyTurn=false`, or `isPaused=true`.

3. **Turn Time Display:** The diagnostic logging will reveal if the room PDAs don't match between Solana and DB, allowing us to fix the enrichment logic.

## Technical Notes

- The Bear Off zone in `BackgammonGame.tsx` lines 2589-2618 IS present but is styled as a subtle info display, not a prominent action button
- BackgammonAI uses the same subtle approach and it works because it's a smaller focused area
- For multiplayer, users need a more obvious action button especially since checkers must be selected first
- The timer mid-turn guard (dice rolled but moves remaining) is intentional and correct - don't want to forfeit mid-move

## Testing After Fix

1. Create ranked room with 10s turn timer
2. Join with second wallet
3. Play a few turns - verify sync works
4. Get all checkers to home board - verify Bear Off button appears prominently on desktop
5. Let timer run out - verify timeout toast and turn passes to opponent
6. Miss 3 turns - verify auto-forfeit triggers
