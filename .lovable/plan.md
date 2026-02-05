
# Plan: Remove Dice Roll for ALL Ludo Games (2, 3, 4 Player)

## Summary
Remove the dice roll ceremony for all Ludo multiplayer games. The creator (player1) will always start for all game sizes, just like the 2-player Chess/Backgammon/Checkers/Dominos games.

## Current State
- **Database function** `maybe_finalize_start_state` already auto-starts for 2-player games (creator starts)
- For 3-4 player Ludo, it uses **random selection** with `gen_random_bytes`
- **Frontend** `useStartRoll.ts` uses `isTwoPlayerGame = maxPlayers <= 2` to decide whether to show dice UI
- **LudoGame.tsx** currently does NOT pass `maxPlayers` to `useStartRoll`, so it defaults to 2 (accidentally correct for hiding dice, but random starter logic still runs in DB)

## Changes Required

### 1. Database: Update `maybe_finalize_start_state` (SQL Migration)
Modify the function to use **creator starts** for ALL games (not just 2-player):

```text
┌─────────────────────────────────────────────────────────┐
│ Before (3-4 player):                                    │
│   v_random_byte := gen_random_bytes(1)                 │
│   v_starting_wallet := random participant              │
├─────────────────────────────────────────────────────────┤
│ After (all games):                                      │
│   v_starting_wallet := player1_wallet (creator)        │
│   method: 'creator_starts'                             │
└─────────────────────────────────────────────────────────┘
```

The function will:
- Remove the 2-player conditional branch
- Always use `player1_wallet` as the starting player
- Record method as `'creator_starts'` for all games
- Still validate acceptance/participant count thresholds

### 2. Frontend: Ensure LudoGame passes correct maxPlayers
Update `LudoGame.tsx` to:
- Extract `maxPlayers` from on-chain room data (already available in `parsed.maxPlayers`)
- Store it in state
- Pass it to `useStartRoll` hook

This ensures the frontend correctly treats ALL Ludo games as "instant start" games.

### 3. Frontend: useStartRoll already handles this
The hook already has logic:
```typescript
const isTwoPlayerGame = maxPlayers <= 2;
```

We'll update this to:
```typescript
// For this project: ALL games skip dice roll (creator always starts)
const skipDiceRoll = true; // or maxPlayers <= 4
```

This makes the dice UI never appear regardless of player count.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/*.sql` | Update `maybe_finalize_start_state` - creator starts for ALL games |
| `src/hooks/useStartRoll.ts` | Change `isTwoPlayerGame` to always skip dice roll |
| `src/pages/LudoGame.tsx` | Add `maxPlayers` state and pass to `useStartRoll` (for correctness) |

---

## Technical Notes

- **No impact on Play vs AI**: AI games don't use `useStartRoll` or the DB function
- **No impact on join/create transactions**: On-chain logic unchanged
- **No impact on settlement/forfeit**: Turn management unchanged
- **Backward compatible**: Existing sessions with `start_roll_finalized = true` continue working
