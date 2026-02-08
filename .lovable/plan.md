
# ✅ COMPLETED: Fix Share Link System - Add useAutoSettlement to All Games

## Summary

Successfully added `useAutoSettlement` hook to all multiplayer games to ensure on-chain settlement triggers automatically when games end, enabling the Share Win/Share Match button to appear.

## Changes Made

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | ✅ Added `useAutoSettlement` import + hook, fixed `isStaked={isRankedGame}` |
| `src/pages/DominosGame.tsx` | ✅ Added `useAutoSettlement` import + hook |
| `src/pages/LudoGame.tsx` | ✅ Added `useAutoSettlement` import + hook, fixed `isStaked={isRankedGame}`, added `winnerWallet` memo |

## Technical Details

### Hook Implementation Pattern

```typescript
// Import
import { useAutoSettlement } from "@/hooks/useAutoSettlement";

// Usage (after rankedGate hook)
const autoSettlement = useAutoSettlement({
  roomPda,
  winner: gameOver ? winnerWallet : null,
  reason: "gameover", // or "resign" for chess
  isRanked: isRankedGame,
});
```

### Ludo-specific: Winner Derivation

Ludo uses `PlayerColor` for `gameOver` state, so we derive the wallet:
```typescript
const winnerWallet = useMemo(() => {
  if (!gameOver || roomPlayers.length === 0) return null;
  const winnerIndex = PLAYER_COLORS.indexOf(gameOver);
  return winnerIndex >= 0 && winnerIndex < roomPlayers.length ? roomPlayers[winnerIndex] : null;
}, [gameOver, roomPlayers]);
```

## Expected Behavior

After these changes:
1. Game ends → `useAutoSettlement` detects non-null `winner`
2. Hook calls `settle-game` edge function (or `settle-draw` for draws)
3. Edge function upserts `match_share_cards` table
4. `GameEndScreen` renders `ShareMatchButton` because `isStaked={isRankedGame}` is now correct
5. Both winner and loser see the share button immediately

## Testing Checklist

- [ ] Play a ranked Chess match → verify "Share Win" / "Share Match" button appears
- [ ] Play a ranked Dominos match → verify share button appears  
- [ ] Play a ranked Ludo match → verify share button appears
- [ ] Play a ranked Backgammon match → verify share button appears (already had hook)
- [ ] Click share button → verify modal opens with copy/WhatsApp options
- [ ] Visit /match/:roomPda → verify public page shows branded card
- [ ] Check `match_share_cards` table has record after game ends
