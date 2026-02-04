

## Fix Backgammon Multiplayer Desktop Board Clipping

### Problem Identified
The board is clipped at the bottom in multiplayer desktop mode because of two key differences from the working AI layout:

### Root Cause Analysis

| Location | AI Layout (Works) | Multiplayer (Broken) |
|----------|-------------------|---------------------|
| **Outer viewport** | `min-h-screen` (no subtraction) | `min-h-[calc(100dvh-4rem)]` (subtracts navbar) |
| **Game area wrapper** | Desktop: just `relative z-10` (no constraints) | Desktop: `flex-1 flex flex-col min-h-0 overflow-hidden` |
| **Result** | Natural content flow, no clipping | Content forced into constrained viewport with `overflow-hidden` |

The critical issue is the **Game Area wrapper** on desktop:

**AI (line 797-799):**
```tsx
<div className={cn(
  "relative z-10",
  isMobile ? "flex-1 flex flex-col min-h-0" : ""
)}>
```

**Multiplayer (line 2164-2165):**
```tsx
<div className={cn(
  "flex-1 flex flex-col min-h-0 overflow-hidden",  // Always applies!
  isMobile ? "px-2 pt-1 pb-2" : "px-2 md:px-4 py-4"
)}>
```

The multiplayer layout applies `overflow-hidden` unconditionally, which clips any content that exceeds the calculated viewport height. Combined with the `flex-1 min-h-0` constraints, the board gets compressed and clipped.

### Solution
Match the AI layout structure for desktop by:
1. Making the game area wrapper constraints conditional - only apply flex constraints on mobile
2. Removing `overflow-hidden` from the desktop game area wrapper
3. Ensuring the desktop layout flows naturally without height constraints

---

### File: `src/pages/BackgammonGame.tsx`

### Change 1: Fix the Game Area wrapper (lines 2164-2167)

**Current:**
```tsx
{/* Game Area */}
<div className={cn(
  "flex-1 flex flex-col min-h-0 overflow-hidden",
  isMobile ? "px-2 pt-1 pb-2" : "px-2 md:px-4 py-4"
)}>
```

**Replace with (matching AI layout pattern):**
```tsx
{/* Game Area */}
<div className={cn(
  "relative z-10",
  isMobile 
    ? "flex-1 flex flex-col min-h-0 overflow-hidden px-2 pt-1 pb-2" 
    : "px-2 md:px-4"
)}>
```

This removes the `flex-1`, `min-h-0`, and `overflow-hidden` constraints from desktop, allowing natural content flow.

---

### Summary of Changes

| Line | Current | New |
|------|---------|-----|
| 2164-2167 | `flex-1 flex flex-col min-h-0 overflow-hidden` always | Conditional: only on mobile |

### Expected Result
- Desktop board will flow naturally without being constrained to viewport height
- No more clipping at the bottom
- Mobile layout remains unchanged (keeps viewport locking)
- Turn timer already visible in sidebar

