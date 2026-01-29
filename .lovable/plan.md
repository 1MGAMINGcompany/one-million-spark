

# Fix Backgammon Timer Display + Desktop Layout

## Two Changes (Highest Value, Lowest Risk)

---

### Change 1: Fix Timer Display on Desktop Sidebar (Issue 4)

**Problem**: Desktop sidebar timer uses `turnTimer.remainingTime` which only works when `isMyTurn === true`. On opponent's turn, it shows "0:00" because the enforcement timer isn't active.

**Evidence from code (lines 2683-2692)**:
```typescript
<p className={cn(
  "font-display text-2xl font-bold",
  turnTimer.isCriticalTime   // ❌ Only accurate for active player
    ? "text-destructive animate-pulse"
    : turnTimer.isLowTime    // ❌ Only accurate for active player  
    ? "text-yellow-400"
    : "text-primary"
)}>
  {Math.floor(turnTimer.remainingTime / 60)}:{(turnTimer.remainingTime % 60).toString().padStart(2, '0')}
  // ❌ turnTimer.remainingTime = 0 when not my turn
</p>
```

**Fix**: Use `displayTimer` (from `useTurnCountdownDisplay`) which calculates from server `turn_started_at` and shows correctly on BOTH devices.

**File**: `src/pages/BackgammonGame.tsx`

**Lines 2683-2692 - Change to**:
```typescript
<p className={cn(
  "font-display text-2xl font-bold",
  displayTimer.isCriticalTime 
    ? "text-destructive animate-pulse"
    : displayTimer.isLowTime 
    ? "text-yellow-400"
    : "text-primary"
)}>
  {displayTimer.displayRemainingTime !== null 
    ? `${Math.floor(displayTimer.displayRemainingTime / 60)}:${(displayTimer.displayRemainingTime % 60).toString().padStart(2, '0')}`
    : "--:--"}
</p>
```

---

### Change 2: Simplify Desktop Layout to Match AI Version (Issue 3)

**Problem**: Multiplayer desktop layout uses complex flex/height constraints that cause visual "weirdness":

**Current (lines 2510-2516)**:
```typescript
<div className="max-w-6xl mx-auto w-full flex-1 min-h-0 overflow-hidden">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 h-full min-h-0">
    <div className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-2">
        <div className="w-full max-w-[min(100%,calc((100dvh-18rem)*2))] aspect-[2/1] relative">
```

**AI Version (perfect) - lines 1088-1093**:
```typescript
<div className="max-w-6xl mx-auto px-2 md:px-4 py-4 md:py-6">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
    <div className="lg:col-span-3 space-y-3 md:space-y-4">
      <div className="relative">
```

**Key differences**:
| AI Version | Multiplayer Version |
|------------|-------------------|
| Simple padding `px-2 md:px-4 py-4 md:py-6` | Complex `flex-1 min-h-0 overflow-hidden` |
| Simple grid without height constraints | Grid with `h-full min-h-0` |
| `space-y-3 md:space-y-4` for board column | `flex flex-col min-h-0 overflow-hidden` |
| Simple `relative` board wrapper | Complex viewport math `max-w-[min(100%,calc((100dvh-18rem)*2))]` |

**Fix**: Replace the outer container structure to match AI version.

**File**: `src/pages/BackgammonGame.tsx`

**Lines 2510-2516 - Change to**:
```typescript
<div className="max-w-6xl mx-auto px-2 md:px-4 py-4 md:py-6">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
    {/* Board Column - 3 columns */}
    <div className="lg:col-span-3 space-y-3 md:space-y-4">
      {/* Board Container with gold frame */}
      <div className="relative">
```

Also need to remove the closing `</div>` for the removed wrapper at line 2640.

**Lines 2639-2640 - Change from**:
```typescript
                  </div>
                </div>
```
**To**:
```typescript
                  </div>
```

---

## Files to Change Summary

| File | Line(s) | Change |
|------|---------|--------|
| `src/pages/BackgammonGame.tsx` | 2510-2516 | Simplify outer containers to match AI version |
| `src/pages/BackgammonGame.tsx` | 2639-2640 | Remove extra closing div from old wrapper |
| `src/pages/BackgammonGame.tsx` | 2683-2692 | Use `displayTimer` instead of `turnTimer` for sidebar |

---

## Why This Won't Break Anything

| Concern | Safety Check |
|---------|--------------|
| Mobile layout change? | No - mobile uses separate `isMobile` branch (lines 1998-2508) |
| AI version change? | No - only touching BackgammonGame.tsx |
| Timer still shows for active player? | Yes - displayTimer works for both players |
| Timer enforcement affected? | No - turnTimer still used for enforcement, just not display |
| Board aspect ratio? | Preserved - board still has `aspect-[2/1]` on the inner container |

---

## Expected Result

1. **Timer shows correct countdown** (10, 9, 8...) on BOTH players' screens
2. **Desktop layout matches AI version** - simpler, cleaner proportions
3. **Mobile unchanged** - separate rendering path not touched

