

# Fix: Turn Timer for Private Games

## Problem Found
When you set a 10-second turn timer for your private chess game, the game showed a 60-second countdown instead.

## Root Cause
The code that saves game settings treats "private" mode as casual and sets turn time to 0. This happens because the condition only checks for "ranked" mode:

```
if gameMode === 'ranked' → use selected turn time
else → use 0
```

Since "private" is not "ranked", it sends 0 to the database. Then the game falls back to the default 60 seconds.

## Database Evidence
Your recent game (room `HDdmiPMh...`):
- Mode: `private` 
- Turn time in DB: `0` (should be 10)
- Result: Timer showed 60 seconds (the fallback default)

## Solution

### 1. Fix Room Creation Settings
**File:** `src/pages/CreateRoom.tsx`

Update the turn time condition to include private mode:

```text
BEFORE: gameMode === 'ranked' ? turnTimeSeconds : 0
AFTER:  (gameMode === 'ranked' || gameMode === 'private') ? turnTimeSeconds : 0
```

This ensures private rooms also save the selected turn time.

### 2. Fix Turn Time Return for Private Mode
**File:** `src/hooks/useRankedReadyGate.ts`

The hook currently returns `turnTimeSeconds: 0` for all non-ranked games, but private games need the actual turn time from the database.

Remove the early return that short-circuits private mode:
- Instead of returning hardcoded 0 for casual games, fetch from DB for private mode

### Files to Change

| File | Change |
|------|--------|
| `src/pages/CreateRoom.tsx` | Include 'private' in turn time condition (lines 324, 330) |
| `src/hooks/useRankedReadyGate.ts` | Remove early return for private mode that returns 0 |

## Verification
After the fix:
- Create a private chess room with 10-second timer
- Database will show `turn_time_seconds: 10`
- Game countdown will show 10 seconds

## Applies to All Games
This fix will work for all multiplayer private games:
- Chess
- Backgammon  
- Checkers
- Dominos
- Ludo

