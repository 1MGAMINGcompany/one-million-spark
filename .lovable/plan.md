

# Fix Onboarding Overlay Size and Backgammon Positioning

## Problem
1. In Backgammon, the "Roll Dice" tutorial cloud (positioned at `bottom-28`) covers the dice button on desktop
2. All game overlays use `max-w-[320px]` and a `w-14 h-14` monkey image, making the cloud larger than needed

## Changes

### All 5 overlay files (same UI changes)
Files: `BackgammonOnboardingOverlay.tsx`, `ChessOnboardingOverlay.tsx`, `CheckersOnboardingOverlay.tsx`, `DominosOnboardingOverlay.tsx`, `LudoOnboardingOverlay.tsx`

- Reduce cloud max-width from `max-w-[320px]` to `max-w-[260px]`
- Shrink monkey image from `w-14 h-14` to `w-10 h-10`
- Keep `text-sm` font size unchanged
- Reduce inner padding from `px-3 py-3` to `px-2.5 py-2`

### Backgammon-specific fix
File: `BackgammonOnboardingOverlay.tsx`

- Move the ROLL_DICE step position from `bottom-28` to `bottom-36` so it sits above the dice area instead of covering it
- This gives more clearance for the dice button on desktop

## No logic changes
Only CSS class adjustments -- no state machine or prop changes needed.

