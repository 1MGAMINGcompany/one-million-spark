
## Fix Backgammon Multiplayer Desktop Board Layout

### Problem
The desktop multiplayer board is still clipped because the current approach tries to force height-based aspect ratio (`h-full max-h-[min(100%,calc(100%-1rem))] aspect-[2/1]`) inside a locked viewport container. This conflicts with the internal board components that have their own height requirements.

### Root Cause
The **AI layout works** because it uses **natural sizing**:
- No forced `max-h` on outer container
- Board wrapper uses `<div className="relative">` (no height forcing)
- Uses `space-y-3 md:space-y-4` for vertical spacing

The **multiplayer layout is broken** because:
- Outer container locks to `min-h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)]`
- Board wrapper forces `h-full max-h-[...] aspect-[2/1]`
- Height-based calculations conflict with internal content

### Solution
Match the AI layout structure exactly for the desktop board wrapper - use **natural sizing with `relative` positioning** instead of forced height constraints.

---

### File: `src/pages/BackgammonGame.tsx`

### Change 1: Update the desktop board column to match AI layout (lines 2403-2412)

**Current (lines 2403-2412):**
```tsx
{/* Board Column - 3 columns */}
<div className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">
  <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-2">
    <div className="h-full max-h-[min(100%,calc(100%-1rem))] aspect-[2/1] max-w-full relative">
    {/* Outer glow */}
    <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
    
    {/* Gold frame */}
    <div className="relative h-full min-h-0 p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
      <div className="h-full min-h-0 bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2 md:p-4 overflow-hidden flex flex-col">
```

**Replace with (matching AI layout at BackgammonAI.tsx lines 1090-1099):**
```tsx
{/* Board Column - 3 columns */}
<div className="lg:col-span-3 space-y-3 md:space-y-4">
  {/* Board Container with gold frame */}
  <div className="relative">
    {/* Outer glow */}
    <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
    
    {/* Gold frame */}
    <div className="relative p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
      <div className="bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2 md:p-4 overflow-hidden">
```

### Change 2: Update the outer game area wrapper (line 2401-2402)

**Current:**
```tsx
<div className="max-w-6xl mx-auto w-full flex-1 min-h-0 overflow-hidden h-full">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 h-full min-h-0 overflow-hidden">
```

**Replace with (matching AI layout):**
```tsx
<div className="max-w-6xl mx-auto px-2 md:px-4 py-4 md:py-6">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
```

### Change 3: Remove `flex flex-col` constraint from inner board content (line ~2440)

**Current (around line 2440):**
```tsx
{/* Board points area - flex-1 to scale */}
<div className="flex-1 min-h-0 flex flex-col justify-center">
```

**Replace with:**
```tsx
{/* Board points area */}
<div>
```

### Change 4: Remove closing wrapper div that no longer exists

After the inner board content, there's an extra `</div>` for the flex wrapper that needs to be removed since we're no longer using that structure.

---

### Summary of Changes

| Location | Current | New (AI-matching) |
|----------|---------|-------------------|
| Board column wrapper | `flex flex-col min-h-0 overflow-hidden` | `space-y-3 md:space-y-4` |
| Board container | `flex-1 min-h-0 ... h-full max-h-[...]` | `relative` (natural sizing) |
| Gold frame inner | `h-full min-h-0 ... flex flex-col` | No height forcing |
| Board points area | `flex-1 min-h-0 flex flex-col` | Simple `div` |
| Outer grid | `h-full min-h-0 overflow-hidden` | No height constraints |

### Turn Timer
Turn timer is already visible in:
1. TurnStatusHeader (line 2148-2155) - shows remaining time on desktop
2. Sidebar card on lg screens (lines 2569-2584)

No changes needed for timer visibility.

### Expected Result
- Board uses natural sizing like AI layout
- No clipping on any edge
- All triangles, checkers, and controls visible
- Turn timer remains visible in header and sidebar
- Mobile layout unchanged (conditional rendering)
