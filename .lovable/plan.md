

# Remove Auto-Sheet Slide-Up Menu + Adjust Nudge Pill Timing

## What's Happening Now

When a first-time visitor arrives on the homepage:
1. After **3 seconds**, the small "nudge pill" (two buttons next to Money) appears -- this is good, you want to keep it
2. After **6 seconds**, a big menu slides up from the bottom ("Start with a free game or play for real SOL?") -- this is what you want removed

## Changes

### File: `src/components/AIAgentHelperOverlay.tsx`

**1. Remove the auto-sheet entirely**
- Delete the `showAutoSheet` state, the `useEffect` that triggers it after 6 seconds (lines 333-371), the `dismissAutoSheet` callback (lines 373-377), and the entire auto-sheet UI rendering block (lines 741-782)
- This removes the big sliding menu completely

**2. Change nudge pill delay from 3s to 2s**
- Line 313: Change `setTimeout(fire, 3000)` to `setTimeout(fire, 2000)`
- The little bubble with "Play Free Now" and "Ask Money" will appear after 2 seconds instead of 3

### What stays the same
- The Money floating bubble (always present)
- The nudge pill with its two buttons (just appears 1 second sooner)
- The full chat sheet when you tap Money
- All other Money behavior on other pages
- No game logic, database, or edge function changes

