

# Remove Welcome Auto-Open Sheet for First-Time Visitors

## The Problem

When a first-time visitor arrives, three things happen in sequence:
1. After 1.5 seconds -- the full Money chat sheet auto-opens (the "big menu sliding up") 
2. After 2 seconds -- the nudge pill with 2 buttons appears (but hidden behind the open sheet)
3. Previously there was also an auto-sheet at 6 seconds (already removed in last fix)

You only want item #2 (the nudge pill). Items #1 and #3 should both be gone.

## Changes

### File: `src/components/AIAgentHelperOverlay.tsx`

**Remove the auto-open welcome sheet** (lines 335-347):
Delete the `useEffect` that checks `isFirstVisit` and auto-opens the full Money sheet after 1.5 seconds. This is the code that runs `setSheetOpen(true)` on first visit.

The nudge pill (2-second timer, already set to 2000ms) stays exactly as is -- that is the only thing first-time visitors will see.

### What stays the same
- The nudge pill appears after 2 seconds with "Play Free Now" and "Ask Money" buttons
- The Money floating bubble is always present and tappable
- The full chat sheet opens when you tap Money manually
- No game logic, database, or edge function changes

