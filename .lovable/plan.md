

# Fix Backgammon Mobile Timer Display

## Summary

After investigating all 5 multiplayer games, I found:
- **Chess, Checkers, Dominos, Ludo**: Already using `TurnStatusHeader` component with `displayTimer.displayRemainingTime` ✅
- **Backgammon Desktop Sidebar**: Just fixed in previous change ✅
- **Backgammon Mobile Inline Timer**: Still using `turnTimer` with "--:--" fallback ❌

**The ONLY remaining fix needed is the Backgammon mobile inline timer.**

---

## Current Bug (Lines 2414-2432)

```typescript
{shouldShowTimer && rankedGate.bothReady && (
  <div className={cn(
    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
    effectiveIsMyTurn 
      ? turnTimer.isCriticalTime          // ❌ Wrong hook for display
        ? "bg-destructive/30 text-destructive animate-pulse"
        : turnTimer.isLowTime             // ❌ Wrong hook for display
        ? "bg-yellow-500/30 text-yellow-400"
        : "bg-muted/50 text-muted-foreground"
      : "bg-muted/30 text-muted-foreground/70"
  )}>
    <Clock className="w-2.5 h-2.5" />
    <span>
      {effectiveIsMyTurn 
        ? `${Math.floor(turnTimer.remainingTime / 60)}:${(turnTimer.remainingTime % 60).toString().padStart(2, '0')}`
        : "--:--"                           // ❌ Shows "--:--" on opponent's turn
      }
    </span>
  </div>
)}
```

---

## Fix

Use `displayTimer` for consistent display on BOTH devices:

```typescript
{shouldShowTimer && rankedGate.bothReady && (
  <div className={cn(
    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
    displayTimer.isCriticalTime          // ✅ Use displayTimer
      ? "bg-destructive/30 text-destructive animate-pulse"
      : displayTimer.isLowTime           // ✅ Use displayTimer
      ? "bg-yellow-500/30 text-yellow-400"
      : "bg-muted/50 text-muted-foreground"
  )}>
    <Clock className="w-2.5 h-2.5" />
    <span>
      {displayTimer.displayRemainingTime !== null 
        ? `${Math.floor(displayTimer.displayRemainingTime / 60)}:${(displayTimer.displayRemainingTime % 60).toString().padStart(2, '0')}`
        : "--:--"                          // ✅ Only shows "--:--" when truly no data
      }
    </span>
  </div>
)}
```

**Key changes:**
1. Replace `effectiveIsMyTurn ? turnTimer.isCriticalTime : ...` with `displayTimer.isCriticalTime`
2. Replace `turnTimer.isLowTime` with `displayTimer.isLowTime`
3. Replace the conditional `effectiveIsMyTurn ? turnTimer.remainingTime : "--:--"` with `displayTimer.displayRemainingTime !== null ? ... : "--:--"`

---

## File to Change

| File | Line(s) | Change |
|------|---------|--------|
| `src/pages/BackgammonGame.tsx` | 2417-2431 | Replace `turnTimer` with `displayTimer` for mobile inline timer |

---

## Why This Is Safe

| Concern | Safety |
|---------|--------|
| Other games affected? | No - they already use `TurnStatusHeader` with `displayTimer` |
| Ludo multi-player? | Already correct - uses `TurnStatusHeader` which handles 2-4 players |
| Timer enforcement? | Unchanged - `turnTimer` still used for enforcement, just not display |
| Desktop affected? | No - desktop was fixed in previous change, this is mobile only |
| Conditional "--:--"? | Now only shows when `displayRemainingTime` is null (timer not active) |

---

## Expected Result

- **Backgammon mobile**: Shows actual countdown (10, 9, 8...) on BOTH players' screens
- **All other games**: Already working correctly via `TurnStatusHeader`

