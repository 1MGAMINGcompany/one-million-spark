# Completed: Turn Timer Enforcement and Room List Turn Time Display

## Summary

Fixed the turn timer enforcement issue where games got stuck after a player's timer expired, and added turn time display to the room list.

## Changes Made

### 1. Fixed `handleTurnTimeout` in ChessGame.tsx and CheckersGame.tsx

**Problem:** The validation check `!isSameWallet(timedOutWallet, activeTurnAddress)` prevented processing of opponent timeouts detected by `useOpponentTimeoutDetection`.

**Solution:** 
- Removed the overly strict validation
- Added a new validation that allows processing if the timed-out wallet matches either the current player OR the opponent
- Fixed `setTurnOverrideWallet` to give turn to the current player when opponent times out (instead of setting it to null)

### 2. Improved `useOpponentTimeoutDetection.ts`

**Problem:** The duplicate processing check only used `turn_started_at`, which could cause issues when the turn switches.

**Solution:** 
- Changed the turn start key to include both `turn_started_at` AND `current_turn_wallet`
- This prevents duplicate processing while correctly allowing new timeout detection after turn changes

### 3. Updated `game-sessions-list` Edge Function

**Change:** Added `turn_started_at` to both the `active` and `recoverable_for_wallet` query selects.

### 4. Added Turn Time Display to RoomList.tsx

**Changes:**
- Added state for `activeSessionsMap` to store session data by room PDA
- Added useEffect to fetch active sessions every 5 seconds
- Added `formatTurnTime` helper function
- Added turn time display (e.g., "10s turn" or "1m turn") for ranked games with active sessions
- Uses amber color with Timer icon to distinguish from other metadata

## Files Modified

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | Fixed `handleTurnTimeout` validation and turnOverrideWallet logic |
| `src/pages/CheckersGame.tsx` | Applied same fix as ChessGame |
| `src/hooks/useOpponentTimeoutDetection.ts` | Improved turn switch detection key |
| `supabase/functions/game-sessions-list/index.ts` | Added `turn_started_at` to query |
| `src/pages/RoomList.tsx` | Added turn time display for active ranked games |

## Expected Behavior

1. When Player A's timer expires, Player B can immediately play
2. Room list shows turn time for ranked games (e.g., "10s turn")
3. 3-strike forfeit rule works correctly for both players
4. Games no longer get stuck when a player times out
