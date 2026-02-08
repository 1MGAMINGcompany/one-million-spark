
# Fix Share Link System - Add useAutoSettlement to All Games

## Problem Summary

Your test revealed several issues preventing the "Share Win / Share Match" button from appearing:

1. **ChessGame.tsx**:
   - Missing `useAutoSettlement` hook (no settlement triggered)
   - Has `isStaked={false}` hardcoded (ShareMatchButton won't show)

2. **DominosGame.tsx** and **LudoGame.tsx**:
   - Also missing `useAutoSettlement` hook

3. **Settlement never happened** for room `BdM7JYwpGtadMMdsq9ucXLuPVurHPB9tW9gdnwxgJEcN`:
   - No `finalize_receipts` record
   - No `match_share_cards` record
   - Winner was declared but no on-chain payout occurred

## Fix Plan

### 1. Add useAutoSettlement to ChessGame.tsx

Add the import and hook usage near the other hooks:

```typescript
import { useAutoSettlement } from "@/hooks/useAutoSettlement";

// Near other hook calls:
const autoSettlement = useAutoSettlement({
  roomPda,
  winner: gameOver ? winnerAddress : null,
  reason: gameStatus.includes("Checkmate") ? "gameover" : 
          gameStatus.includes("resign") ? "resign" : "gameover",
  isRanked: isRankedGame,
});
```

### 2. Fix ChessGame.tsx GameEndScreen Props

Change from:
```typescript
isStaked={false}
```

To:
```typescript
isStaked={isRankedGame}
```

### 3. Add useAutoSettlement to DominosGame.tsx

Same pattern as Chess - add import and hook:

```typescript
import { useAutoSettlement } from "@/hooks/useAutoSettlement";

const autoSettlement = useAutoSettlement({
  roomPda,
  winner: gameOver ? winnerWallet : null,
  reason: "gameover",
  isRanked: isRankedGame,
});
```

### 4. Add useAutoSettlement to LudoGame.tsx

Same pattern:

```typescript
import { useAutoSettlement } from "@/hooks/useAutoSettlement";

const autoSettlement = useAutoSettlement({
  roomPda,
  winner: gameOver ? winnerWallet : null,
  reason: "gameover",
  isRanked: isRankedGame,
});
```

### 5. Ensure GameEndScreen shows ShareMatchButton for all staked games

The current logic at line 702-712 should work once `isStaked` is properly passed:
```typescript
{isStaked && roomPda && (
  <ShareMatchButton
    roomPda={roomPda}
    isWinner={isWinner}
    gameName={gameType}
    className="w-full"
  />
)}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | Add `useAutoSettlement` hook, fix `isStaked` prop |
| `src/pages/DominosGame.tsx` | Add `useAutoSettlement` hook |
| `src/pages/LudoGame.tsx` | Add `useAutoSettlement` hook |

## Technical Details

### useAutoSettlement Hook Behavior

The hook automatically:
1. Watches for `winner` to become non-null
2. Calls `settle-game` edge function for wins
3. Calls `settle-draw` edge function for draws
4. The edge functions upsert into `match_share_cards` with payout data
5. Idempotent - safe if called multiple times

### Settlement Edge Function Flow

```text
Game Ends (gameOver = true)
    │
    ▼
useAutoSettlement detects winner
    │
    ├─► winner === "draw" → settle-draw edge function
    │
    └─► winner === wallet → settle-game edge function
                              │
                              ▼
                          upserts match_share_cards
                              │
                              ▼
                          ShareMatchButton visible
```

## Testing Checklist

After implementation:

1. Play a ranked Chess match → verify "Share Win" / "Share Match" button appears
2. Play a ranked Dominos match → verify share button appears
3. Play a ranked Ludo match → verify share button appears
4. Play a ranked Backgammon match → verify share button appears (already has hook)
5. Click share button → verify modal opens with copy/WhatsApp options
6. Visit /match/:roomPda → verify public page shows branded card
7. Check `match_share_cards` table has record after game ends

## Expected Outcome

After these fixes:
- Both winner AND loser see the share button immediately when game ends
- Share button appears for all ranked/staked games (Chess, Backgammon, Checkers, Dominos, Ludo)
- Clicking opens fun share modal with copy link and WhatsApp options
- Public match page at /match/:roomPda shows branded result card with confetti for winners
