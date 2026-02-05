
## Fix Plan: Room List UI + Turn Sync Debugging

### Issues to Fix

1. **Turn Time Not Showing in Room List**
   - The enrichment code was added to `useSolanaRooms.ts` but there may be a timing issue or the data isn't being returned correctly
   - Need to verify the enrichment is working

2. **Mobile Room Card Layout Cut Off**
   - The room card content is overflowing on mobile (visible in screenshot)
   - The badges and buttons need to wrap/stack on smaller screens

3. **Turn Sync Verification**
   - The server-side guard was already added in the recent migration
   - The game log shows Turn 4 had a race condition (move after turn_end)
   - With the new guard, this should now be rejected

---

### Fix 1: Mobile Room Card Layout

**File:** `src/pages/RoomList.tsx`

Update the room card to handle mobile better:

```text
Current layout:
[Icon] [Game Name #ID] [Ranked Badge] [← cuts off on mobile]
       [Stake] [Players] [Timer] [Creator]               [Join]

Proposed mobile layout:
[Icon] [Game Name]                                       [Join]
       [#ID] [Ranked]
       [Stake] [Players] [Timer]
```

Changes:
- Use `flex-wrap` on the badges row to allow wrapping
- Hide less critical badges on mobile (creator wallet)
- Reduce badge padding/sizing on mobile
- Make the join button shrink-proof

### Fix 2: Verify Turn Time Enrichment

**File:** `src/hooks/useSolanaRooms.ts`

Add debug logging to verify the enrichment is working:
- Log when sessions are fetched from database
- Log the turn time map contents

### Fix 3: Turn Sync - Already Applied

The server-side guard in `submit_game_move` RPC was added in the recent migration. It rejects:
- `dice_roll` or `move` from the same wallet that just submitted `turn_end`

This should prevent the Turn 4 race condition going forward.

---

### Implementation Details

#### RoomList.tsx - Mobile Card Layout

```typescript
// Line ~410-471: Room Info section
<div className="flex-1 min-w-0 overflow-hidden">
  {/* First row: Game name + Join button context */}
  <div className="flex items-center gap-2 flex-wrap">
    <h3 className="font-semibold truncate">
      {getGameName(room.gameType)}
    </h3>
    {/* Room ID and mode badges on same row, wrapping allowed */}
    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary shrink-0">
      #{room.roomId}
    </span>
    {/* Mode Badge - smaller on mobile */}
    <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full border flex items-center gap-0.5 sm:gap-1 shrink-0 ${...}`}>
      {/* Shorter labels on mobile */}
      <span className="hidden sm:inline">{isRanked ? t("createRoom.gameModeRanked") : t("createRoom.gameModeCasual")}</span>
      <span className="sm:hidden">{isRanked ? 'Ranked' : 'Casual'}</span>
    </span>
  </div>
  
  {/* Second row: Stats - wrap on mobile */}
  <div className="flex items-center gap-2 sm:gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
    <span className="flex items-center gap-1 shrink-0">
      <Coins className="h-3.5 w-3.5" />
      {room.entryFeeSol > 0 ? `${room.entryFeeSol} SOL` : '—'}
    </span>
    <span className="flex items-center gap-1 shrink-0">
      <Users className="h-3.5 w-3.5" />
      {room.playerCount}/{room.maxPlayers}
    </span>
    {room.turnTimeSec > 0 && (
      <span className="flex items-center gap-1 shrink-0">
        <Clock className="h-3.5 w-3.5 text-amber-400" />
        {room.turnTimeSec}s
      </span>
    )}
    {/* Creator wallet only on larger screens */}
    <span className="hidden md:flex items-center gap-1 truncate">
      {room.creator.slice(0, 4)}...{room.creator.slice(-4)}
    </span>
  </div>
</div>
```

---

### Technical Notes

1. **Turn time enrichment** - The code in `useSolanaRooms.ts` is correct, but sessions might not exist yet for rooms where the creator just created but hasn't been joined. Only rooms with an active game session will have turn times.

2. **Mobile card overflow** - The current `flex` layout doesn't handle small screens well because badges don't wrap. Adding `flex-wrap` and `shrink-0` on badges fixes this.

3. **Server-side turn guard** - Already deployed. The guard checks if the last move was `turn_end` by the same wallet and rejects subsequent `dice_roll` or `move` attempts.
