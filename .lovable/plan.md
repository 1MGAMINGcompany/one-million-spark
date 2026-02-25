

# Fix: Checkmate Board Visibility + Settlement Error Toast

## Problem 1: Board Not Visible on Checkmate

The victory announcement overlay at line 1515 uses `fixed inset-0 bg-background/70 backdrop-blur-sm` which **completely covers and blurs the board**. When you make the checkmate move, the board state updates and the overlay appears simultaneously -- you never see the winning position.

### Fix

Make the overlay **transparent** so the board stays visible, and show "CHECKMATE" as a floating banner on top of the board:

- Remove `bg-background/70 backdrop-blur-sm` from the overlay
- Position the text as a centered banner with its own solid background (not full-screen coverage)
- Add a 500ms delay before showing the announcement so the board renders the final move first
- Show "CHECKMATE" prominently in large gold text, with "White wins!" / "Black wins!" as subtitle

**File**: `src/pages/ChessGame.tsx`

**Victory overlay (lines 1513-1525)** -- change from full-screen blurred cover to a floating banner:
```
{victoryAnnouncement && (
  <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
    <div className="text-center animate-in zoom-in-75 duration-500 bg-background/90 border-2 border-primary rounded-xl px-8 py-6 shadow-[0_0_60px_-10px_hsl(45_93%_54%_/_0.8)]">
      <p className="text-5xl md:text-7xl font-black text-primary drop-shadow-[0_0_32px_hsl(45_93%_54%_/_0.7)] tracking-wider">
        CHECKMATE
      </p>
      <p className="text-xl md:text-3xl font-semibold text-foreground/80 mt-3">
        {victoryAnnouncement}
      </p>
    </div>
  </div>
)}
```

**triggerVictoryAnnouncement (line 874)** -- add 500ms delay so the board renders the move first:
```typescript
const triggerVictoryAnnouncement = useCallback((message: string) => {
  if (victoryTimeoutRef.current) clearTimeout(victoryTimeoutRef.current);
  // Small delay so the board renders the checkmate position first
  setTimeout(() => {
    setVictoryAnnouncement(message);
  }, 500);
  victoryTimeoutRef.current = setTimeout(() => {
    setVictoryAnnouncement(null);
    setShowEndScreen(true);
  }, 3500); // 500ms delay + 3s display
}, []);
```

**Checkmate calls (lines 902-903 and 1162-1163)** -- pass just the winner info, headline comes from the overlay:
```typescript
const winningColor = currentGame.turn() === 'w' ? 'Black' : 'White';
triggerVictoryAnnouncement(`${winningColor} wins!`);
```

## Problem 2: "Settlement Issue" Red Toast

Line 792-799 shows a red destructive toast for settlement errors. Even handled race conditions can trigger this, scaring users.

### Fix

Remove the red toast entirely. Log to console for debugging. The GameEndScreen already has recovery UI if settlement truly fails.

```typescript
useEffect(() => {
  if (!autoSettlement.result) return;
  if (autoSettlement.result.success) {
    console.log("[ChessGame] Settlement complete:", autoSettlement.result.signature || "already settled");
  } else if (autoSettlement.result.error) {
    console.warn("[ChessGame] Settlement issue (silent):", autoSettlement.result.error);
  }
}, [autoSettlement.result]);
```

## Problem 3: Mobile Profile Button (AI Overlay z-index)

**File**: `src/components/AIAgentHelperOverlay.tsx`
- Line 698: backdrop `z-[9997]` to `z-40`
- Line 701: content `z-[9998]` to `z-[45]`
- Line 744: backdrop `z-[9997]` to `z-40`
- Line 745: content `z-[9998]` to `z-[45]`

## Summary of Changes

| File | What | Lines |
|------|------|-------|
| `src/pages/ChessGame.tsx` | Add 500ms delay to victory announcement so board renders first | ~874-881 |
| `src/pages/ChessGame.tsx` | Make overlay a floating banner (board visible behind it) + "CHECKMATE" headline | ~1513-1525 |
| `src/pages/ChessGame.tsx` | Change announcement text to just "White/Black wins!" | ~902-903, 1162-1163 |
| `src/pages/ChessGame.tsx` | Remove red settlement toast, log silently | ~786-801 |
| `src/components/AIAgentHelperOverlay.tsx` | Lower z-index on backdrops | ~698, 701, 744, 745 |

### What is NOT touched
- No board layout or game logic changes
- No edge function changes
- No database changes
- No changes to other game types

