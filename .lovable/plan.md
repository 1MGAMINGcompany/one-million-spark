

# Fix: Bear Off Zone Should Light Up When Bear Off Is Available

## Problem
The bear off zone on mobile multiplayer only lights up after a player selects a specific checker that can bear off. Before selecting a checker, it stays dim even when all pieces are in the home board and bearing off is possible. Players don't realize they can bear off.

## Root Cause
The glow condition is `validMoves.includes(-2)`, which is only populated after tapping a checker. The zone needs a second "ready" state that activates when `canBearOff` is true, it's the player's turn, and dice have been rolled.

## Solution
Add an intermediate "ready to bear off" visual state that glows (without the full pulse animation) when bearing off is available but no checker is selected yet. This signals to the player that bear off is active.

### Changes to `src/pages/BackgammonGame.tsx` (mobile bear off zone only, lines ~2493-2524)

**1. Add a computed flag** before the mobile return block:
```
const bearOffReady = isMyTurn && !gameOver && dice.length > 0 && canBearOff(gameState, myRole) && !validMoves.includes(-2);
```

**2. Update the bear off zone styling** to add a "ready" glow state:

Current 3 states:
- `validMoves.includes(-2)` -- full pulse (selected checker can bear off)
- `canBearOff` -- dim border
- else -- locked/disabled

New 4 states:
- `validMoves.includes(-2)` -- full pulse, "Tap to Bear Off" (unchanged)
- `bearOffReady` -- **NEW**: solid gold border + subtle glow, "Select checker to Bear Off (X/15)" -- tells player to tap a home checker
- `canBearOff` but not my turn -- dim border, shows count
- else -- locked/disabled

**3. Update the label text** for the new ready state:
- Show "Select checker to Bear Off" so the player knows to tap a piece first

**4. Make the ready state clickable** -- when tapped in the "ready" state, auto-select the furthest checker in home board that has a bear-off move, populating validMoves with -2

### What This Achieves
- Bear off zone glows gold as soon as all checkers are home and dice are rolled
- Player sees clear indication that bearing off is available
- Tapping the glowing zone auto-selects the best checker for bear off
- No changes to desktop, Play vs AI, or board size

### Technical Details

The styling for the new `bearOffReady` state:
```
"bg-primary/15 border-2 border-primary/70 cursor-pointer shadow-[0_0_15px_hsl(45_93%_54%_/_0.3)]"
```

The onClick handler update:
```typescript
onClick={() => {
  if (validMoves.includes(-2)) {
    handlePointClick(-2);
  } else if (bearOffReady) {
    // Find first home checker that can bear off and select it
    const allMoves = getAllLegalMoves(gameState, remainingMoves, myRole);
    const bearOffMove = allMoves.find(m => m.to === -2 || m.to === 25);
    if (bearOffMove) {
      handlePointClick(bearOffMove.from);
    }
  }
}}
```

