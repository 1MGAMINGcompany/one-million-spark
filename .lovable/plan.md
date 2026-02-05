
## Fix Plan: Room List Column Display

### Current Issues

1. **Turn Time not showing**: The enrichment queries the database by `room_pda`, but if no `game_sessions` record exists for the room, no turn time is displayed
2. **Missing "Winning" column**: The prize pool/winnings amount is not shown
3. **Mobile layout**: Need to ensure all columns fit on mobile screens

### Requested Columns

| Column | Current Status | Fix |
|--------|---------------|-----|
| GAME | ✅ Shown | Keep |
| ENTRY FEE | ✅ Shown | Keep |
| **WINNING** | ❌ Missing | Add (Entry × Players - 5% fee) |
| NUMBER OF PLAYERS | ✅ Shown | Keep |
| RANKED | ✅ Shown | Keep |
| **TURN TIME** | ⚠️ Hidden when 0 | Always show (use "—" for unknown) |

---

### Implementation Details

#### File: `src/pages/RoomList.tsx`

Update the room card second row to include all requested info:

```text
Current:
[Coins] 0.0062 SOL  [Users] 1/2  [Clock] 10s (if > 0)

Proposed:
[Coins] 0.0062 SOL  [Trophy] ~0.0118 SOL  [Users] 1/2  [Clock] 10s / —
```

**Changes:**

1. **Add Winning/Prize column** with Trophy icon
   - Calculate: `room.entryFeeSol * room.maxPlayers * 0.95` (after 5% platform fee)
   - Show with "~" prefix to indicate approximate (depends on players joining)
   - Use `prizePoolSol` from room data or calculate

2. **Always show Turn Time column**
   - If `room.turnTimeSec > 0`: Show `Xs`
   - If `room.turnTimeSec === 0` or undefined: Show "—" (em-dash)
   - This makes the column always visible for consistency

3. **Mobile-friendly layout**
   - Use `flex-wrap` (already done)
   - Reduce text size on mobile
   - Use abbreviated labels where needed

---

### Code Changes

```typescript
// Second row: Stats - wrap on mobile
<div className="flex items-center gap-2 sm:gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
  {/* Entry Fee */}
  <span className="flex items-center gap-1 shrink-0">
    <Coins className="h-3.5 w-3.5" />
    {room.entryFeeSol > 0 ? `${room.entryFeeSol} SOL` : '—'}
  </span>
  
  {/* Winning (Prize Pool) - NEW */}
  <span className="flex items-center gap-1 shrink-0 text-amber-400">
    <Trophy className="h-3.5 w-3.5" />
    {room.entryFeeSol > 0 
      ? `~${(room.entryFeeSol * room.maxPlayers * 0.95).toFixed(4)} SOL`
      : '—'}
  </span>
  
  {/* Players */}
  <span className="flex items-center gap-1 shrink-0">
    <Users className="h-3.5 w-3.5" />
    {room.playerCount}/{room.maxPlayers}
  </span>
  
  {/* Turn Time - ALWAYS SHOW */}
  <span className="flex items-center gap-1 shrink-0">
    <Clock className="h-3.5 w-3.5 text-amber-400" />
    {room.turnTimeSec > 0 ? `${room.turnTimeSec}s` : '—'}
  </span>
</div>
```

---

### Why Turn Time Doesn't Show (Root Cause)

The enrichment code is correct, but it fails when there's no `game_sessions` record for the room PDA. This happens when:
- The room was created before the settings save feature
- Settings failed to save during room creation
- Room was created via external tools

**Current behavior**: If no session exists → `turn_time_seconds` is null → `turnTimeSec` stays at 0 → clock icon hidden

**New behavior**: Always show the clock column, display "—" for unknown/no timer

---

### Summary of Changes

| File | Change |
|------|--------|
| `src/pages/RoomList.tsx` | Add "Winning" column with Trophy icon |
| `src/pages/RoomList.tsx` | Always show Turn Time column (use "—" for 0/unknown) |
| `src/pages/RoomList.tsx` | Ensure mobile-friendly wrapping with all columns |
