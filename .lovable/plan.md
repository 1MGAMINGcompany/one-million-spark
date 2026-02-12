

# Fix: Multiplayer Backgammon Board Cut Off on Mobile

## Problem
On mobile, the controls area below the board (Roll Dice, status bar, Bear Off zone, Resign button) pushes content past the bottom of the viewport. The board itself gets compressed but the controls still overflow, making Bear Off and Resign partially or fully hidden.

## Root Cause
The controls section has `shrink-0` with `minHeight: 80px`, plus multiple stacked elements each with padding and `space-y-2` gaps. Combined height of all controls exceeds available space after the board takes its share.

## Solution
Compact the controls area so everything fits within the viewport without scrolling. No changes to the game-viewport container height or the BackgammonAI page.

### Changes to `src/pages/BackgammonGame.tsx` (mobile layout only)

1. **Remove rigid `minHeight` on controls container** (line 2405): Change `style={{ minHeight: '80px' }}` to no minHeight, and reduce `space-y-2` to `space-y-1`

2. **Remove rigid `minHeight` on Roll Button wrapper** (line 2407): Remove `style={{ minHeight: '52px' }}` -- let the button size itself naturally, and only reserve space when visible

3. **Compact the Roll Dice button**: Reduce from `py-3 text-base` to `py-2 text-sm` to save vertical space

4. **Compact the Status Bar**: Reduce `px-3 py-1.5` to `px-2 py-1` for tighter fit

5. **Compact the Bear Off zone**: Reduce `py-2` to `py-1.5`

6. **Make controls area scrollable as safety net**: Add `overflow-y-auto` to the controls container so if content still overflows on very small screens, it scrolls rather than being cut off

7. **Reduce `mt-2` to `mt-1`** on the controls container to reclaim more space

### What This Achieves
- Saves ~40-50px of vertical space by removing minHeights and reducing padding
- Controls fit within the viewport on standard mobile devices
- Scrollable fallback prevents cutoff on unusually small screens
- Board stays at maximum size via `flex-1 min-h-0`
- No changes to the viewport container class or height calculation
- No changes to BackgammonAI (Play vs AI) page

### Technical Details

The controls container changes from:
```
<div className="shrink-0 mt-2 space-y-2" style={{ minHeight: '80px' }}>
```
to:
```
<div className="shrink-0 mt-1 space-y-1 overflow-y-auto max-h-[40vh]">
```

Roll button wrapper changes from:
```
<div style={{ minHeight: '52px' }}>
```
to:
```
<div>
```

Roll button changes from `py-3 text-base` to `py-2 text-sm`.

Status bar changes from `px-3 py-1.5` to `px-2 py-1`.

Bear Off zone changes from `py-2` to `py-1.5`.

