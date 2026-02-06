# Turn Timer Fixes - COMPLETED

## Summary of Changes Made

### ✅ Fix 1: Consecutive Missed Turn Detection
Added `timeoutFiredRef.current = false` reset after non-forfeit timeouts in BackgammonGame.tsx.
Added comments in all 5 game files clarifying that opponent's device detects turn change via polling.

### ✅ Fix 2: Remove 5-Second Timer for Backgammon & Ludo  
- Modified CreateRoom.tsx to conditionally hide 5-second option for game types 3 (Backgammon) and 5 (Ludo)
- Added useEffect to auto-switch to 10s if 5s was previously selected when changing to these games

### Files Modified
- `src/pages/BackgammonGame.tsx` - Reset timeoutFiredRef after skip
- `src/pages/LudoGame.tsx` - Added comment for clarity
- `src/pages/ChessGame.tsx` - Added comment for clarity  
- `src/pages/CheckersGame.tsx` - Added comment for clarity
- `src/pages/DominosGame.tsx` - Added comment for clarity
- `src/pages/CreateRoom.tsx` - Conditional 5s option + auto-switch effect

## Room List Turn Time Issue
The "—" display for turn time is expected for rooms that haven't created a game_sessions row yet (rooms waiting for opponent where creator hasn't set settings). The enrichment logic is working correctly for rooms that have sessions.

## How Turn Timer Works
1. Timer counts down on the current player's device
2. When timer expires → `turn_timeout` move recorded to DB with `nextTurnWallet`
3. DB updates `current_turn_wallet` to opponent
4. Opponent's device detects turn change via 5s polling
5. Opponent's timer starts automatically
6. If same player misses 3 consecutive turns → auto_forfeit
