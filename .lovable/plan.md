
# Fix Private Room Issues: Turn Time, Share Dialog, and Room List Filtering

## Issues Identified

Based on the session replay and code analysis, there are **three distinct bugs** affecting private rooms:

### Bug 1: Turn Time Shows as 0 for Private Rooms
**Root Cause:** In `CreateRoom.tsx` line 318, the turn time is only preserved for ranked mode:
```typescript
const authoritativeTurnTime = gameMode === 'ranked' ? turnTimeSeconds : 0;
```
This means both `casual` AND `private` modes send `turnTimeSeconds: 0` to the edge function, ignoring the user's selection.

**Evidence:** The screenshot shows `turnTimeSeconds=0` in the signed message, even though the user selected 10 seconds.

### Bug 2: Share Dialog Not Opening for Private Rooms  
**Root Cause:** The share dialog auto-open logic in `Room.tsx` (lines 215-222) depends on:
1. `isPrivateCreated` query param being present
2. `roomModeLoaded` being true 
3. `roomMode === 'private'`

However, the `roomMode` fetch (lines 169-212) retries up to 5 times with 800ms delays. If the edge function call to save settings **fails** (as shown in screenshot: "Settings Error: Failed to save game settings"), the game_sessions row may not have `mode='private'` yet, causing `roomMode` to default to `'casual'` after retries. This breaks the condition `roomMode === 'private'`.

### Bug 3: Private Rooms Appearing in Room List
**Root Cause:** In `RoomList.tsx` line 460, the filtering logic is:
```typescript
.filter((room) => activeSessionsMap.get(room.pda)?.mode !== 'private')
```
This relies on the `activeSessionsMap` which is populated from the `game-sessions-list` edge function. If:
- The game session wasn't created properly (settings save failed), OR
- The session exists but mode wasn't set to 'private', OR  
- The room was just created and hasn't been indexed yet

...then `activeSessionsMap.get(room.pda)` returns `undefined`, and `undefined?.mode !== 'private'` evaluates to `true`, so the room is NOT filtered out.

---

## Technical Solution

### Fix 1: Allow Turn Time for Private Mode
**File:** `src/pages/CreateRoom.tsx`

Change line 318 from:
```typescript
const authoritativeTurnTime = gameMode === 'ranked' ? turnTimeSeconds : 0;
```
To:
```typescript
const authoritativeTurnTime = (gameMode === 'ranked' || gameMode === 'private') ? turnTimeSeconds : 0;
```

This ensures private rooms can have enforced turn timers just like ranked rooms.

Also update the localStorage line 311-313 to match:
```typescript
localStorage.setItem(`room_settings_${roomPdaStr}`, JSON.stringify({
  turnTimeSeconds: (gameMode === 'ranked' || gameMode === 'private') ? turnTimeSeconds : 0,
  stakeLamports: solToLamports(entryFeeNum),
}));
```

### Fix 2: Open Share Dialog Immediately After Private Room Creation
**File:** `src/pages/Room.tsx`

The current logic waits for `roomModeLoaded && roomMode === 'private'` which can fail if the settings edge function failed.

Change the approach: trust the `?private_created=1` query param as the source of truth for showing the dialog immediately, rather than waiting for DB confirmation.

Modify lines 214-222:
```typescript
// Auto-open share dialog for private rooms when created
useEffect(() => {
  // Trust the query param - if private_created=1, show dialog immediately
  // Don't wait for DB mode confirmation which may fail/delay
  if (isPrivateCreated) {
    setShowShareDialog(true);
    // Clear the query param
    searchParams.delete('private_created');
    setSearchParams(searchParams, { replace: true });
  }
}, [isPrivateCreated, searchParams, setSearchParams]);
```

This ensures the share dialog opens even if the settings edge function had issues.

### Fix 3: Robust Private Room Filtering in Room List
**File:** `src/pages/RoomList.tsx`

The current filtering only checks the DB-sourced `activeSessionsMap`. We need a fallback mechanism.

Option A (Recommended): Filter on-chain rooms using a combination of DB mode AND any indication the room might be private.

Modify lines 459-461:
```typescript
{rooms
  .filter((room) => {
    const sessionData = activeSessionsMap.get(room.pda);
    // If we have session data, check mode
    if (sessionData?.mode === 'private') return false;
    // If no session data yet, still show room (can't know if private)
    // The room will be filtered once session syncs
    return true;
  })
  .map((room) => (
```

However, this doesn't fully solve the race condition. A more robust fix is to:
1. Ensure the edge function call in CreateRoom succeeds before navigating
2. Show a brief loading state while settings are being saved
3. Only navigate after settings are confirmed saved

Option B (Defensive): Make CreateRoom wait for edge function success before navigation for private rooms specifically.

**File:** `src/pages/CreateRoom.tsx`

After the edge function call (around line 363-394), add logic to:
- If mode is 'private' and settings save failed, show an error and do NOT navigate
- Only navigate to room page if settings were successfully saved

```typescript
if (settingsErr || data?.ok === false) {
  console.error("[TurnTimer] Settings save failed");
  // For private rooms, this is critical - don't navigate
  if (gameMode === 'private') {
    toast({
      title: "Failed to Create Private Room",
      description: "Could not save room settings. Please try again.",
      variant: "destructive",
    });
    // Cancel the room on-chain since we can't configure it
    // Or at minimum, don't navigate
    return; // Early return - don't navigate
  }
  // For ranked/casual, show warning but continue
  toast({
    title: "Settings Error",
    description: "Failed to save game settings. Turn timer may default to 60s.",
    variant: "destructive",
  });
}
```

Move the navigation call (lines 396-398) inside an else block or after confirming success.

---

## Implementation Sequence

1. **Fix Turn Time Calculation** (CreateRoom.tsx)
   - Update `authoritativeTurnTime` to include private mode
   - Update localStorage write to match

2. **Improve Share Dialog Trigger** (Room.tsx)  
   - Remove dependency on `roomModeLoaded && roomMode === 'private'`
   - Trigger immediately on `isPrivateCreated` query param

3. **Make Private Room Creation Atomic** (CreateRoom.tsx)
   - For private mode, require successful settings save before navigation
   - Show clear error if settings can't be saved
   - Prevents zombie private rooms that appear in public list

4. **Add Defensive Filtering** (RoomList.tsx)
   - Ensure filtering handles edge cases gracefully
   - Log when rooms can't be properly categorized

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CreateRoom.tsx` | Fix turn time for private mode; require settings success before navigation for private rooms |
| `src/pages/Room.tsx` | Trust query param for share dialog instead of waiting for DB confirmation |
| `src/pages/RoomList.tsx` | Optional: Add defensive logging for unclassified rooms |

---

## Expected Outcomes

After implementing these fixes:

1. **Turn time displays correctly** - Private rooms will show the selected turn time (e.g., 10 seconds) in the rules signing message

2. **Share dialog opens immediately** - After creating a private room, the ShareInviteDialog will open without waiting for DB sync

3. **Private rooms stay hidden** - If settings save fails, the room creation will fail cleanly rather than creating a half-configured room that leaks into the public list

4. **Better error handling** - Users will see clear feedback if private room creation fails, rather than being left with a broken room
