
# Fix: Chess Board Vertical Shifting Between Turns

## Root Cause

The `TurnStatusHeader` component (used above the chess board) has a conditional element at **lines 136-143** -- a "My Turn Badge" pill that only renders when `isMyTurn` is true:

```text
{isMyTurn && (
  <div className="flex justify-center">
    <div className="inline-flex items-center gap-2 px-4 py-1.5 ...">
      <Crown /> My Turn
    </div>
  </div>
)}
```

When it is your turn, this badge appears and pushes the board down by ~40px. When the opponent plays, the badge disappears and the board jumps back up. This repeats every turn.

## Fix

**Reserve the space permanently** so the board never shifts, regardless of whose turn it is. Two options:

**Option A (recommended):** Always render the badge container but make it invisible when it is not your turn. Use `opacity-0` and `pointer-events-none` instead of removing it from the DOM. This keeps the exact same height at all times with zero layout shift.

**Option B:** Hide the badge entirely but add a fixed `min-height` to the `TurnStatusHeader` wrapper. Less clean because the exact pixel height can vary across screen sizes.

Going with **Option A**.

## Technical Details

### File: `src/components/TurnStatusHeader.tsx`

**Lines 136-143** -- Change the conditional render to always render the container, toggling visibility:

Before:
```text
{isMyTurn && (
  <div className="flex justify-center">
    <div className="inline-flex items-center gap-2 ...">
```

After:
```text
<div className={cn("flex justify-center", !isMyTurn && "opacity-0 pointer-events-none")}>
  <div className="inline-flex items-center gap-2 ...">
```

This is a single-line change. The badge still occupies its vertical space when hidden, so the board stays perfectly stable.

### What is NOT touched
- No board size changes
- No game logic, matchmaking, settlement, or backend changes
- No changes to ChessBoardPremium, ChessGame page layout, or any other component
