

## Fix Backgammon Multiplayer Desktop Board Clipping - Final Solution

### Current Problem
The board is still clipped at the bottom (as shown in the screenshot) because the previous fix only addressed the Game Area wrapper, but the **outer viewport container** still has constraints that conflict with natural content flow on desktop.

### Root Cause Comparison

| Element | AI Layout (Works) | Multiplayer (Broken) |
|---------|-------------------|---------------------|
| **Outer viewport** | Desktop: `min-h-screen` (natural) | Desktop: `min-h-[calc(100dvh-4rem)] flex flex-col` |
| **Game Area wrapper** | Desktop: `relative z-10` only | Desktop: `relative z-10` (already fixed) |
| **Result** | Content flows naturally | Container still constrains height due to outer wrapper |

The AI layout (line 748-751) uses:
```tsx
isMobile ? "h-screen overflow-y-hidden flex flex-col" : "min-h-screen"
```

The multiplayer layout (line 1996-2002) uses:
```tsx
isMobile 
  ? "min-h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] overflow-hidden" 
  : "min-h-[calc(100dvh-4rem)]"  // Still subtracts navbar!
```

The key difference: AI uses `min-h-screen` with NO `flex flex-col` on desktop. The multiplayer version applies `flex flex-col` unconditionally on line 1997, AND uses a calculated height that can cut content.

---

### Solution

Change the outer viewport container to match the AI layout pattern:
1. Remove unconditional `flex flex-col` - only apply on mobile
2. Use `min-h-screen` for desktop instead of calculating navbar offset
3. Keep mobile constraints intact

---

### File: `src/pages/BackgammonGame.tsx`

### Change: Update outer viewport container (lines 1996-2003)

**Current (lines 1996-2003):**
```tsx
<div className={cn(
  "game-viewport bg-background flex flex-col relative",
  // Mobile: lock viewport to prevent scroll, Desktop: allow natural height (prevents clipping)
  isMobile 
    ? "min-h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] overflow-hidden" 
    : "min-h-[calc(100dvh-4rem)]",
  "pb-[env(safe-area-inset-bottom)]"
)}>
```

**Replace with (matching AI layout pattern):**
```tsx
<div className={cn(
  "game-viewport bg-background relative",
  isMobile 
    ? "h-[calc(100dvh-4rem)] overflow-y-hidden flex flex-col" 
    : "min-h-screen",
  "pb-[env(safe-area-inset-bottom)]"
)}>
```

---

### Summary

| Property | Before | After (matches AI) |
|----------|--------|-------------------|
| Desktop `flex flex-col` | Always applied | Removed for desktop |
| Desktop min-height | `min-h-[calc(100dvh-4rem)]` | `min-h-screen` |
| Mobile behavior | Unchanged | Unchanged |

### Expected Result
- Board will flow naturally on desktop without being cut off at bottom
- All triangles, checkers, bear-off zones, and controls will be visible
- Mobile layout remains locked to viewport (no changes)
- Turn timer and sidebar remain visible

### Connection Issue (logged for later)
The logs show normal database connections with no errors. The "connection issue" mentioned may be related to WebRTC/Realtime sync which can be addressed separately after fixing the layout.

