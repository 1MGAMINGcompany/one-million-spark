
# Fix Plan: Turn Timer Issues + Room List Turn Time Display

## Summary of Issues Identified

### Issue 1: Room List Turn Time Not Showing (Still shows "—")
**Root Cause:** The enrichment query is working correctly (logs show `turn_time_seconds: 10` in DB), but the room PDA returned from Solana doesn't match what's stored in `game_sessions`. 

Looking at the database:
- DB has: `BqsuTuDFxQESLKjsx3QA1eREBhe1SWG2FUAwc54sJcZ` and `64rQ8DP5TCgj7xGTp8NYoAQHv2aVNyTmxtGd83baM5tM`
- But Room List query is looking for rooms that haven't created sessions yet

The issue: `game_sessions` is only created AFTER the room creator sets settings or someone joins. For newly created rooms that are "waiting for opponent", no session exists yet = no turn time to display.

**Fix:** When a room is created, ensure `game_session_set_settings` is called to create the session immediately.

---

### Issue 2: Turn Timer Stays With Same User Until 3 Missed Turns

**Evidence from Game Logs:**
```
Turn 13: turn_end → nextTurnWallet = BSBA... (opponent)
Turn 14: auto_forfeit → missedCount=3, timedOutWallet = BSBA... 
```

The gap between turn 13 (02:15:01) and turn 14 (02:15:45) is **44 seconds**. With a 10-second turn timer, there should have been:
- Turn 14: turn_timeout after 10s (02:15:11)
- Turn 15: turn_timeout after 10s (02:15:21)  
- Turn 16: auto_forfeit after 10s (02:15:31)

**Root Cause:** The timer IS counting on the non-moving player's device, but:
1. When the timer fires `handleTurnTimeout`, it increments `missedCount` and sends a `turn_timeout` move
2. The local state updates to pass turn to opponent (`setCurrentTurnWallet(nextTurnWallet)`)
3. BUT there's no **timer reset and restart** for the next missed turn detection
4. The `timeoutFiredRef.current = true` debounce prevents multiple fires, but it's never reset for the SAME player's consecutive missed turns

**Issue:** The timer only fires ONCE per `isMyTurn` change. If my turn stays "true" (because I missed), the timer doesn't restart.

---

### Issue 3: After Rolling Dice & Playing, No Timer Enforcement

**Root Cause:** The mid-turn guard (lines 1076-1082 in BackgammonGame.tsx):

```typescript
if (dice.length > 0 && remainingMoves.length > 0) {
  console.log("[handleTurnTimeout] Ignoring timeout - mid-turn with dice");
  return;  // Timer is BLOCKED while player has moves remaining
}
```

This prevents timeout while the player is actively moving pieces. **This is intentional** to avoid unfair forfeits mid-move. However, the user wants strict enforcement where even mid-move delays cause turn loss.

**Behavior Decision Required:**
- **Current (generous):** Timer only fires before rolling dice or after completing all moves
- **User wants (strict):** Timer runs continuously regardless of game phase

---

### Issue 4: Remove 5-Second Turn Timer for Backgammon and Ludo

The user requests removing the 5-second timer option for Backgammon and Ludo since these games have more complex decisions. Keep 5-second option only for Chess, Checkers, and Dominos.

---

## How Turn Time Works in These Games

| Game | Typical Turn Time | Complexity |
|------|------------------|------------|
| **Chess** | 5-60s (fast chess) to unlimited | Single piece moves, but deep strategy |
| **Checkers** | 5-30s | Simple piece moves |
| **Dominos** | 5-30s | Single tile placement |
| **Backgammon** | 15-60s | Roll dice, potentially 2-4 checker moves per turn |
| **Ludo** | 10-30s | Roll dice, move token, can involve captures |

**Backgammon** and **Ludo** require multiple sub-actions per turn (roll + multiple moves), so 5 seconds is too aggressive.

---

## Implementation Plan

### Fix 1: Consecutive Missed Turn Detection (HIGH PRIORITY)

**Problem:** After a missed turn, the timer doesn't restart for the same player.

**Solution:** When `handleTurnTimeout` processes a missed turn (not auto_forfeit), reset the timer to allow consecutive timeout detection:

**File:** `src/pages/BackgammonGame.tsx`

```typescript
// After updating local state for turn skip (around line 1175-1179):
// Reset timer for consecutive missed turn detection
turnTimer.resetTimer();
timeoutFiredRef.current = false;  // Allow next timeout to fire
```

Also add this pattern to `LudoGame.tsx`, `ChessGame.tsx`, `CheckersGame.tsx`, and `DominosGame.tsx`.

---

### Fix 2: Remove 5-Second Timer for Backgammon & Ludo

**File:** `src/pages/CreateRoom.tsx`

Add game-type-aware timer options:

```typescript
// Around line 614-619, make timer options dynamic based on game type
const timerOptions = useMemo(() => {
  const gameTypeNum = parseInt(gameType);
  // Backgammon (3) and Ludo (5) - no 5-second option
  if (gameTypeNum === 3 || gameTypeNum === 5) {
    return [
      { value: "10", label: t("createRoom.seconds", { count: 10 }) },
      { value: "15", label: t("createRoom.seconds", { count: 15 }) },
      { value: "30", label: t("createRoom.seconds", { count: 30 }) },
      { value: "0", label: t("createRoom.unlimited") },
    ];
  }
  // Chess, Checkers, Dominos - include 5-second option
  return [
    { value: "5", label: t("createRoom.seconds", { count: 5 }) },
    { value: "10", label: t("createRoom.seconds", { count: 10 }) },
    { value: "15", label: t("createRoom.seconds", { count: 15 }) },
    { value: "0", label: t("createRoom.unlimited") },
  ];
}, [gameType, t]);

// Reset turn time if current selection is invalid for new game type
useEffect(() => {
  const gameTypeNum = parseInt(gameType);
  if ((gameTypeNum === 3 || gameTypeNum === 5) && turnTime === "5") {
    setTurnTime("10");  // Default to 10s for Backgammon/Ludo
  }
}, [gameType, turnTime]);
```

---

### Fix 3: Room List Turn Time - Ensure Session Created on Room Creation

**File:** `src/hooks/useSolanaRooms.ts` (in `createRoom` function)

Currently, `game-session-set-settings` is called after room creation, but we need to verify it's being called correctly and the room PDA matches.

**Investigation:** Add debug logging to verify the room PDA being passed:

```typescript
// After room creation (around line 450+)
console.log("[CreateRoom] Calling game-session-set-settings with PDA:", roomPda);
```

**Potential Fix:** Ensure the exact same PDA string format is used for both Solana account and DB storage.

---

### Fix 4: Strict Timer Enforcement (Optional - Based on User Preference)

If the user wants the timer to continue even while moving checkers:

**Option A (Recommended):** Keep mid-turn guard but reduce remaining time instead of full reset:
- When player rolls dice, don't reset timer
- Timer continues from where it was

**Option B (Aggressive):** Remove mid-turn guard entirely:
- Player must complete all moves within time limit
- May cause frustration on slow connections

**Current recommendation:** Keep the mid-turn guard but ensure timer doesn't reset after each individual move.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/BackgammonGame.tsx` | Reset timer after missed turn to detect consecutive misses |
| `src/pages/LudoGame.tsx` | Same timer reset pattern |
| `src/pages/ChessGame.tsx` | Same timer reset pattern |
| `src/pages/CheckersGame.tsx` | Same timer reset pattern |
| `src/pages/DominosGame.tsx` | Same timer reset pattern |
| `src/pages/CreateRoom.tsx` | Remove 5-second option for Backgammon/Ludo |
| `src/hooks/useSolanaRooms.ts` | Debug logging for room creation PDA |

---

## Technical Details

### Why Consecutive Timeouts Don't Work Currently

```
Timeline (10s timer):
00:00 - Turn passes to Player B (BSBA...)
00:10 - Timer expires → handleTurnTimeout fires
       → missedCount = 1
       → setCurrentTurnWallet(opponent) ← LOCAL state says "opponent's turn"
       → timeoutFiredRef.current = true ← BLOCKS future fires
       → BUT isMyTurn is still TRUE (state hasn't propagated)
       
00:11 - useEffect detects currentTurnWallet changed
       → Resets turnTimer.resetTimer() ← Timer resets
       → BUT effectiveIsMyTurn is now FALSE
       → Timer STOPS counting because !isMyTurn

Result: Timer stops after first missed turn because the local state update
        makes isMyTurn = false, which stops the countdown.
```

**The Real Problem:** After the local `setCurrentTurnWallet(nextTurnWallet)` call, `effectiveIsMyTurn` becomes `false`, which stops the timer. But the turn didn't actually pass on the opponent's device!

### Correct Behavior Required

When a player misses a turn:
1. Record `turn_timeout` to DB
2. Update `current_turn_wallet` in DB → opponent takes over
3. On opponent's device, polling detects turn change → they get the turn
4. On the timeouting player's device, timer should STOP (they lost their turn)

The issue is that after `setCurrentTurnWallet(nextTurnWallet)`:
- Local state: "It's opponent's turn"
- DB state: `current_turn_wallet` = opponent
- Timer: Stops (correctly)

**BUT** if the opponent doesn't move, the opponent's device should be counting down their turn. The timeout detection is correct - the problem is the consecutive miss tracking.

### Root Issue Identified

Looking at game logs again:
```
02:15:01 - turn_end from Fbk1 → nextTurn = BSBA
02:15:45 - auto_forfeit from BSBA (missedCount=3)
```

44 seconds gap, 3 missed turns detected. This means the timer WAS firing repeatedly on BSBA's device, incrementing missedCount until it hit 3.

**The actual issue:** The timer IS working, but the consecutive misses aren't being recorded as separate `turn_timeout` moves in the database. Only the final `auto_forfeit` is recorded.

**Solution:** Each missed turn should record a `turn_timeout` move AND pass the turn to opponent in the DB. Currently, after missing, the local state changes but the opponent doesn't get notified until the final forfeit.

---

## Summary: What Needs to Happen

1. **After each missed turn (not just forfeit):**
   - Record `turn_timeout` move to DB ← This IS happening (line 1158-1168)
   - Update `current_turn_wallet` in DB to opponent ← This should happen via submit_game_move RPC
   - On opponent's device, they should see "Opponent skipped, your turn"
   
2. **The consecutive miss tracking is CLIENT-SIDE (localStorage):**
   - This is the design flaw - if the user closes tab, missed count resets
   - Should be tracked server-side in `game_sessions` or `game_moves`

3. **For this fix, we'll ensure:**
   - Timer reset works correctly for consecutive detection
   - Each timeout is properly recorded
   - Remove 5s option for Backgammon/Ludo
