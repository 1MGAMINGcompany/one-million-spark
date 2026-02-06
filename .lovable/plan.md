
# Investigation Summary: Game Flow Issues + Turn Timer Display

## Issues Found

### Issue 1: Turn Time Not Displaying in Room List (Screenshot)
Looking at the screenshot, the room card shows:
- `⊙ 0.0066 SOL` - Entry fee ✓
- `🏆 ~0.0125 SOL` - Prize pool ✓  
- `👥 1/2` - Players ✓
- `🕐 —` - Turn time shows **dash** instead of "10s"

**Root Cause:** The turn time IS stored correctly in the database (`turn_time_seconds: 10`), but the Room List enrichment query happens AFTER fetching from Solana. Looking at the code:

```typescript
// Line 354-358 in useSolanaRooms.ts
if (dbTurnTime !== undefined && dbTurnTime > 0) {
  room.turnTimeSec = dbTurnTime;
}
```

The room PDA `#1770340838746` corresponds to the recently created room. The database shows `turn_time_seconds: 10` for `AFqKJMHtjBz5nTvLkUSYR66L4dqMHzvqgeX3q7y8DcYe`, but the Solana-fetched room may have a different PDA format. The enrichment query uses the exact room_pda match, so if there's a mismatch, it won't enrich.

**More likely cause:** The session lookup returns rooms, but logging shows it might be returning 0 matches because the `game_sessions` table query uses `room_pda` which comes from on-chain, and the enrichment logs say "No sessions found" when none match.

### Issue 2: `submit-move` Edge Function Returning 404
**Critical finding from logs:**
```
OPTIONS | 404 | https://mhtikjiticopicziepnj.supabase.co/functions/v1/submit-move
```

The `submit-move` edge function is NOT deployed! This means:
- **All moves are failing to persist**
- No game moves are being recorded
- The game "worked" locally in each browser, but moves never synced

**Evidence:** The game session shows the game ended via `forfeit-game`, and the `game_moves` table is **empty** for this room - no moves were ever recorded.

### Issue 3: Game Started Without Real Sync
Because `submit-move` returned 404:
1. Creator rolled dice → failed to persist (404)
2. Joiner rolled dice → failed to persist (404)
3. Each player saw their own local state, not synced
4. Eventually someone forfeited (manually or via timeout)

## Files That Need Changes

| File/Function | Change Needed |
|--------------|---------------|
| Edge Function `submit-move` | **DEPLOY** - currently not deployed |
| `src/pages/RoomList.tsx` | Minor: Log enrichment results for debugging |

## Fix Plan

### Fix 1: Deploy the `submit-move` Edge Function
This is the critical fix. The function exists in `supabase/functions/submit-move/index.ts` but is not deployed.

**Action:** Deploy the edge function immediately.

### Fix 2: Verify Turn Time Enrichment
The code at lines 330-364 of `useSolanaRooms.ts` should enrich rooms correctly. We need to verify the database session PDAs match the on-chain PDAs.

**Verification steps:**
1. Check if `game_sessions.room_pda` exactly matches what's returned from Solana
2. Add verbose logging if the query returns 0 sessions

### Technical Notes

**Backgammon Engine Rules (from code analysis - unchanged):**
- Standard 24-point board with 15 checkers per player
- Player (positive values) moves from point 24 → 1 (indices 23 → 0)
- AI/Opponent (negative values) moves from point 1 → 24 (indices 0 → 23)
- Home boards: Player = indices 0-5, Opponent = indices 18-23
- Bearing off requires all 15 checkers in home board
- Hit on single opponent checker (blot) sends to bar
- Game results: Single (1x), Gammon (2x), Backgammon (3x)

**BackgammonAI (reference - DO NOT MODIFY):**
- Uses local engine with difficulty levels (easy/medium/hard)
- Maps between legacy `GameState` and engine `BackgammonState`
- Handles animations via `useCheckerAnimation` hook
- This file is considered finalized per memory

## Testing After Fix

1. **Verify submit-move is deployed:**
   - Create a ranked room
   - Join with second wallet
   - Roll dice → should see logs in edge function
   - Make a move → move should appear in `game_moves` table

2. **Verify turn time display:**
   - Create room with 10s turn timer
   - Refresh Room List
   - Should see "10s" next to clock icon

3. **Full game flow test:**
   - Play at least 3-4 turns alternating
   - Verify moves sync between devices
   - Verify timer counts down
   - Verify forfeit works correctly
