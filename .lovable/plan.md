

## Fix Backgammon Multiplayer Desktop Board Layout

### Problem
The desktop multiplayer Backgammon board is clipped on all sides because the aspect-ratio constraint doesn't properly account for all UI elements above and below the board. The turn timer also needs to be prominently visible.

### Root Cause Analysis
The board uses `max-w-[min(100%,calc((100dvh-18rem)*2))]` to constrain width based on available height. However:
1. The outer container is already `calc(100dvh-4rem)` 
2. Header takes ~3rem
3. TurnStatusHeader takes ~6rem (with My Turn badge)
4. Controls row below board takes ~3rem
5. Padding adds ~2rem

The calculation should reference the **container's available height**, not the full viewport.

### Solution
Switch to a simpler, more reliable approach that doesn't require complex calculations:
1. Remove the complex `calc((100dvh-18rem)*2)` max-width calculation
2. Use a flex-based approach with `max-h` constraints on the board area
3. Let the aspect-ratio box scale naturally within the constrained height

---

### File: `src/pages/BackgammonGame.tsx`

### Change 1: Update the desktop board column layout (lines 2403-2530)

Replace the board column structure to use height-based constraints instead of width calculations:

**Current (line 2403-2406):**
```tsx
{/* Board Column - 3 columns */}
<div className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">
  <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-2">
    <div className="w-full max-w-[min(100%,calc((100dvh-18rem)*2))] aspect-[2/1] relative">
```

**Replace with:**
```tsx
{/* Board Column - 3 columns */}
<div className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">
  <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-2">
    <div className="h-full max-h-[min(100%,calc(100%-1rem))] aspect-[2/1] max-w-full relative">
```

**Why this works:**
- `h-full max-h-[min(100%,calc(100%-1rem))]` - Uses available height from the flex container, with small margin
- `aspect-[2/1]` - Maintains the 2:1 ratio
- `max-w-full` - Prevents horizontal overflow
- The height flows naturally from the flex parent which is already properly constrained

### Change 2: Ensure grid has proper height constraints (line 2401-2402)

**Current:**
```tsx
<div className="max-w-6xl mx-auto w-full flex-1 min-h-0 overflow-hidden">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 h-full min-h-0">
```

**Replace with:**
```tsx
<div className="max-w-6xl mx-auto w-full flex-1 min-h-0 overflow-hidden h-full">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 h-full min-h-0 overflow-hidden">
```

### Change 3: Add min-h-0 to inner board wrapper (line 2411-2412)

**Current:**
```tsx
<div className="relative h-full p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
  <div className="h-full bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2 md:p-4 overflow-hidden flex flex-col">
```

**Replace with:**
```tsx
<div className="relative h-full min-h-0 p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
  <div className="h-full min-h-0 bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2 md:p-4 overflow-hidden flex flex-col">
```

---

### Turn Timer Visibility
The turn timer is already visible in two places for desktop:
1. **TurnStatusHeader** (line 2148-2155) - Shows timer inline with turn status
2. **Sidebar card** (lines 2569-2584) - Shows larger timer in sidebar on lg screens

No changes needed for timer visibility - it's already properly shown.

---

### Summary of Changes

| Line | Change |
|------|--------|
| 2401 | Add `h-full` to outer wrapper |
| 2402 | Add `overflow-hidden` to grid |
| 2406 | Change max-width calc to height-based: `h-full max-h-[min(100%,calc(100%-1rem))] aspect-[2/1] max-w-full` |
| 2411-2412 | Add `min-h-0` to frame divs for flex shrink |

### Expected Result
- Board will scale down to fit available space without clipping
- Aspect ratio 2:1 maintained
- All triangles, checkers, and controls visible
- Turn timer visible in TurnStatusHeader (and sidebar on large screens)
- Mobile and AI layouts unaffected

