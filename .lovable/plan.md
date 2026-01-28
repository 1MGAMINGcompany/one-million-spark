
# Fix Turn Timer Display + Room Join Page Turn Time + Desktop Backgammon Layout

## Summary of Issues

Based on the user's test and the uploaded screenshots, there are **3 distinct issues**:

### Issue 1: Turn Timer Not Visible on Desktop (Private Rooms)
**Root Cause**: The timer UI is gated on `isRankedGame && startRoll.isFinalized && !gameOver`, but for private rooms `isRankedGame` is `false`.

**Evidence from code**:
- Line 2414: `{isRankedGame && startRoll.isFinalized && !gameOver && (...timer display...)}`  
- Line 2680: `{isRankedGame && startRoll.isFinalized && !gameOver && (...timer card...)}`

**Fix**: Change to use `shouldShowTimer` (which already correctly includes `effectiveTurnTime > 0` check) or `(isRankedGame || isPrivate)`.

---

### Issue 2: Join Room Popup Missing Turn Time
**Root Cause**: The `Room.tsx` page displays stake information but does **NOT** show the turn time selected by the room creator.

**Evidence from code**:
- `turnTimeSeconds` is fetched and stored in state (line 211)
- The Stake Information card (lines 1080-1103) shows Entry Fee, Pot, Winner Gets, but no turn time

**Fix**: Add a new row in the Room info UI that displays the turn time (e.g., "10 sec/turn" or "No time limit" for casual).

---

### Issue 3: Backgammon Desktop Board Layout Issue
**From the screenshot**: The board appears to have awkward spacing/positioning with the sidebar showing "Game Status: Opponent's turn" but no timer visible. The user says "mobile is perfect, don't touch it."

**Observations**:
- The main board layout structure looks correct (3-column grid with 1-column sidebar)
- The issue is that the desktop sidebar shows "Game Status" but the Turn Timer card (line 2679-2694) is hidden because `isRankedGame` is false
- The layout itself appears functional; the "weirdness" may be the missing timer + context mismatch

**Fix**: Showing the timer (Issue 1 fix) should resolve the perceived layout problem. If additional layout tweaks are needed after testing, they can be addressed separately.

---

## Technical Changes

### Change 1: BackgammonGame.tsx - Fix Timer Visibility for Private Rooms

**File**: `src/pages/BackgammonGame.tsx`

Update both timer display locations to use `shouldShowTimer` instead of `isRankedGame`:

```typescript
// Line 2414 (mobile inline timer) - BEFORE:
{isRankedGame && startRoll.isFinalized && !gameOver && (

// Line 2414 - AFTER:
{shouldShowTimer && rankedGate.bothReady && (
```

```typescript
// Line 2680 (desktop sidebar timer card) - BEFORE:
{isRankedGame && startRoll.isFinalized && !gameOver && (

// Line 2680 - AFTER:
{shouldShowTimer && rankedGate.bothReady && (
```

**Why `shouldShowTimer && rankedGate.bothReady`?**
- `shouldShowTimer = effectiveTurnTime > 0 && gameStarted && !gameOver` (already defined at line 1109)
- Adding `rankedGate.bothReady` ensures timer only shows when both players are truly ready
- This works for BOTH ranked AND private rooms because `effectiveTurnTime` is set from DB

---

### Change 2: Room.tsx - Display Turn Time in Room Details

**File**: `src/pages/Room.tsx`

Add turn time display to the Stake Information section (around line 1080-1103):

```typescript
// After "Stake Information" section, add Turn Time display
{/* Turn Time - for ranked/private modes */}
{turnTimeSeconds > 0 && (
  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-primary/10">
    <Clock className="h-4 w-4 text-primary" />
    <span className="text-sm text-muted-foreground">Time per turn:</span>
    <span className="text-sm font-semibold text-primary">{turnTimeSeconds} seconds</span>
  </div>
)}
```

Also need to import `Clock` from lucide-react.

---

## Files to Change

| File | Change |
|------|--------|
| `src/pages/BackgammonGame.tsx` | Line 2414: Change `isRankedGame && startRoll.isFinalized && !gameOver` → `shouldShowTimer && rankedGate.bothReady` |
| `src/pages/BackgammonGame.tsx` | Line 2680: Same change |
| `src/pages/Room.tsx` | Add turn time display in stake info section + import Clock icon |

---

## Why This Won't Break Anything

| Concern | Answer |
|---------|--------|
| Will casual games show timer? | No - casual games have `effectiveTurnTime = 0`, so `shouldShowTimer` is false |
| Will ranked games still work? | Yes - `shouldShowTimer` includes the same conditions plus turn time check |
| Will private games show timer? | Yes - private games have turn time set, so `shouldShowTimer` will be true |
| Will timer show before game ready? | No - we add `rankedGate.bothReady` to prevent premature display |

---

## Verification After Implementation

1. **Create a private Backgammon room** with 10 sec turn time
2. **Before opponent joins**: Verify timer is NOT shown (game not ready)
3. **After opponent joins**: Verify timer IS visible on desktop sidebar
4. **Check Room.tsx join page**: Verify turn time shows "10 seconds" in the room details
5. **Verify casual room**: Timer should NOT show (turn time = 0)
6. **Verify mobile**: Timer should show in mobile inline display when appropriate

---

## Desktop Backgammon Layout Context

Looking at the screenshot, the user may also be referring to the overall board proportions. The current grid layout is:
- 3 columns for board
- 1 column for sidebar

The board uses `max-w-[min(100%,calc((100dvh-18rem)*2))] aspect-[2/1]` which maintains proper aspect ratio. If after fixing the timer the layout still appears "weird", we can investigate further, but the primary visual issue appears to be the missing timer card making the sidebar look incomplete.
