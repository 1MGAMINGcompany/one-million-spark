

# Fix: Board Slot vs Room Index Mapping Bugs in Ludo Multiplayer

## Problem

The previous fix correctly introduced `activeSlots` to map room positions to board slots (e.g., 2-player: `[0, 2]`), but several places in `LudoGame.tsx` still use `currentPlayerIndex` (a board slot: 0 or 2) as a direct index into `roomPlayers[]` (which only has indices 0 and 1). This causes:

- **Winner address is wrong**: If sapphire (slot 2) wins, code tries `roomPlayers[2]` which is `undefined`
- **Turn display is broken**: `turnPlayers[currentPlayerIndex]` looks up by board slot (2) in a filtered array that only has 2 entries
- **Start roll starter is wrong**: Sets `currentPlayerIndex` to room index (0 or 1) instead of board slot (0 or 2)
- **Polling fallback sets wrong turn**: Same room-index-to-slot confusion

## LudoAI Impact: NONE

LudoAI uses a completely separate engine (`useLudoGame` from `src/hooks/useLudoGame.ts` + `src/lib/ludo/engine.ts`). None of the multiplayer changes touched these files. LudoAI always runs with 4 players, all using the original engine. No regression risk.

## Bugs to Fix (all in `src/pages/LudoGame.tsx`)

### Bug 1: Winner address lookup (line 831)
**Current**: `roomPlayers[winnerIndex]` -- winnerIndex is a board slot (e.g., 2), but roomPlayers only has entries at indices 0 and 1.
**Fix**: Map through activeSlots: `const roomIdx = activeSlots.indexOf(winnerIndex); return roomIdx >= 0 ? roomPlayers[roomIdx] : null;`

### Bug 2: activeTurnAddress (line 788)
**Current**: `turnPlayers[currentPlayerIndex]` -- turnPlayers is filtered (only 2 entries for 2-player), currentPlayerIndex can be 2.
**Fix**: `turnPlayers.find(tp => tp.seatIndex === currentPlayerIndex)?.address || null`

### Bug 3: TurnStatusHeader activePlayer (line 1321)
**Current**: `turnPlayers[currentPlayerIndex]` -- same filtered array vs slot index mismatch.
**Fix**: `turnPlayers.find(tp => tp.seatIndex === currentPlayerIndex)`

### Bug 4: Start roll starter mapping (line 393-395)
**Current**: `setCurrentPlayerIndex(starterIndex)` where starterIndex is a roomPlayers index (0 or 1).
**Fix**: `setCurrentPlayerIndex(activeSlots[starterIndex] ?? starterIndex)` to convert to board slot.

### Bug 5: Polling fallback turn mapping (line 742-744)
**Current**: `setCurrentPlayerIndex(dbTurnIndex)` where dbTurnIndex is a roomPlayers index.
**Fix**: `setCurrentPlayerIndex(activeSlots[dbTurnIndex] ?? dbTurnIndex)` to convert to board slot.

### Bug 6: "Waiting" status text (line 1372)
**Current**: Shows opponent color name from `currentPlayer.color` -- but for 2-player, when it's player 2's turn, the color should show "Sapphire" not "Ruby".
This is actually correct since `currentPlayer` comes from `players[currentPlayerIndex]` which uses the board slot. No fix needed.

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/LudoGame.tsx` | Fix 5 index mapping bugs (winner, activeTurnAddress, TurnStatusHeader, startRoll, polling) |

## What Does NOT Change

- LudoAI.tsx (completely separate engine, not affected)
- useLudoEngine.ts (already correct with activeSlots)
- LudoBoard.tsx (already correct with activePlayerIndices)
- ludoTypes.ts (already correct)
- Any edge functions or database schema
