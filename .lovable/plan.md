

# Fix Plan: Game Sync Flow + Turn Timer Display

## Problem Summary

There are three interconnected issues preventing games from starting:

### Issue 1: Joiner's Acceptance Not Recorded
When a player joins a room, their acceptance entry isn't being created in `game_acceptances`. The database shows:
- `participants`: 2 wallets (from on-chain sync)
- `game_acceptances`: Only 1 entry (creator)
- `p2_ready`: false despite the joiner having staked on-chain

The `maybe_finalize_start_state` function requires BOTH counts to be >= 2, so the game never starts.

### Issue 2: RulesGate Returns Null But Game Board Not Rendered
After removing the dice roll ceremony, `RulesGate` returns `null` when `effectiveBothReady` is true. However, the game pages still wrap `DiceRollStart` in `RulesGate`, and render the actual game board AFTER the gate based on `startRoll.isFinalized`. This creates a gap where:
- RulesGate returns null (no children)
- Game board doesn't render (waiting for `startRoll.isFinalized`)
- Result: blank screen

### Issue 3: Turn Timer Display
The turn timer IS displayed in the room list (line 466-470), but rooms may show "—" if the database session doesn't exist yet or `turn_time_seconds` is null.

## Root Causes

### Cause A: fetchUserActiveRoom() Race Condition
In the join flow (useSolanaRooms.ts line 723), the code calls `fetchUserActiveRoom()` to get the room PDA for recording acceptance. However, this function fetches from on-chain data which may not be updated yet immediately after the transaction confirms.

The fix from earlier added a retry, but the underlying issue is that `fetchUserActiveRoom()` may return the wrong room or null.

### Cause B: Game Start Logic Mismatch
The memory says "creator-first-no-dice" but `maybe_finalize_start_state` requires:
1. `game_acceptances` count >= `max_players`
2. `participants` count >= `max_players`

When joiner's acceptance fails, condition 1 fails, so the game never auto-starts.

### Cause C: RulesGate/Game Page Rendering Gap
The current flow:
1. RulesGate checks `effectiveBothReady`
2. If true, returns `null` (per previous edit)
3. Game page checks `startRoll.isFinalized` to render game board
4. But `startRoll.isFinalized` depends on DB having `start_roll_finalized=true`
5. That flag is set by `maybe_finalize_start_state` which never runs because acceptance failed

## Solution

### Fix 1: Use Room PDA from Join Transaction Directly
Instead of calling `fetchUserActiveRoom()` after join, we already know the roomPda from the join function parameters. Pass it through directly to avoid race conditions.

### Fix 2: Fallback Auto-Start Based on Participants Only
Update `maybe_finalize_start_state` to use `participants` array as the primary signal since it's synced from authoritative on-chain data. If `participants.length >= required_count`, auto-start regardless of `game_acceptances` count.

### Fix 3: RulesGate Should Show Game When Both Ready
Instead of returning `null`, RulesGate should signal that the gate is passed. The game pages should then render the game board directly. We need to add a "gatePassed" signal or restructure the rendering.

### Fix 4: Ensure Turn Time is Saved During Room Creation
The turn time is already being saved via `game-session-set-settings`. The issue may be timing - the session row might not exist when settings are saved.

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useSolanaRooms.ts` | Pass roomPda directly to record_acceptance instead of fetching |
| `supabase/migrations/new.sql` | Update `maybe_finalize_start_state` to use participants as primary signal |
| `src/components/RulesGate.tsx` | Return a proper signal instead of null, or pass through children |
| `src/pages/ChessGame.tsx` | Update rendering to not depend on DiceRollStart when gate passed |
| `src/pages/BackgammonGame.tsx` | Same update |
| `src/pages/CheckersGame.tsx` | Same update |
| `src/pages/DominosGame.tsx` | Same update |
| `src/pages/LudoGame.tsx` | Same update |

## Implementation Details

### Fix 1: Direct PDA Usage in Join Flow

In `useSolanaRooms.ts` `joinRoom` function, the roomPda is already available from the function parameters. Update the acceptance recording to use it directly:

```typescript
// Before (line 723-726):
const joinedRoom = await fetchUserActiveRoom();
if (joinedRoom?.pda) {
  const stakeLamports = Math.floor(joinedRoom.entryFeeSol * LAMPORTS_PER_SOL);

// After:
// Use the roomPda we already have from the room parameter
// and fetch stake from on-chain data we already fetched
const { data: acceptResult, error: rpcError } = await supabase.rpc("record_acceptance", {
  p_room_pda: roomPda, // Use the PDA we already know
  p_wallet: publicKey.toBase58(),
  // ... rest of params
});
```

### Fix 2: Update maybe_finalize_start_state

Change the function to prioritize `participants` array (from on-chain) over `game_acceptances`:

```sql
-- NEW: Participants-first logic
-- If participants is full, start immediately (on-chain is authoritative)
IF v_participants_count >= v_required_count THEN
  -- Continue to auto-start
  -- Don't wait for game_acceptances
END IF;
```

### Fix 3: RulesGate Rendering Fix

Instead of returning `null`, RulesGate should explicitly render children when ready:

```tsx
// When both ready, per architecture decision
// Per memory: game starts immediately with creator first
if (effectiveBothReady) {
  // Render children (or game should render directly based on this)
  return <>{children}</>;
}
```

But wait - the issue is that children = DiceRollStart which we want to skip. The real fix is:

1. Remove `DiceRollStart` from RulesGate children
2. Have RulesGate return empty fragment when passed
3. Game pages render game board based on `rankedGate.bothReady` instead of `startRoll.isFinalized`

### Fix 4: Game Page Rendering Update

Update all game pages to render game board when `rankedGate.bothReady` OR `startRoll.isFinalized`:

```tsx
// Current condition to show game board:
if (!rankedGate.bothReady || !startRoll.isFinalized) {
  return <RulesGate ...> {/* gates */} </RulesGate>
}

// New condition:
const canShowGameBoard = rankedGate.bothReady && (
  !isRankedGame || // Casual games show immediately
  startRoll.isFinalized || // Normal case
  startRoll.showDiceRoll === false // Server auto-finalized
);
```

## Technical Notes

- The `participants` array is synced from on-chain by `ranked-accept` edge function when the room reaches 2 players
- When both players have staked on-chain, `participants.length >= 2` is guaranteed
- The `maybe_finalize_start_state` function should trust this on-chain data
- `game_acceptances` is a secondary confirmation that may fail due to network issues

## Expected Behavior After Fix

1. When joiner stakes on-chain, `participants` array is updated
2. `maybe_finalize_start_state` detects `participants.length >= 2`
3. Game auto-starts with creator going first
4. Both devices see game board within 2-3 seconds
5. Turn timer displays correctly in room list (if session exists)

## Testing Checklist

- Create a ranked room with turn timer set to 10s
- Have another wallet join the room
- Verify both devices show game board (not stuck on "Waiting")
- Verify turn timer shows "10s" in room list before joining
- Verify turn timer counts down during gameplay
- Verify forfeit button works

