

# Add USD Price Conversion Everywhere SOL Is Shown

## Overview
The `useSolPrice` hook already exists with a `formatUsd()` helper that converts any SOL amount to `~$X.XX`. It's used on the AddFunds page but nowhere in the predictions flow. We need to wire it into FightCard and PredictionModal so every SOL amount shows its USD equivalent.

## Changes

### 1. `src/components/predictions/FightCard.tsx`
- Import and call `useSolPrice()` to get `formatUsd`
- Add USD beneath each SOL display:
  - Fighter A pool: `0.25 SOL` → `0.25 SOL (~$X.XX)`
  - Fighter B pool: same treatment
  - Total Pool: same treatment

### 2. `src/components/predictions/PredictionModal.tsx`
- Import and call `useSolPrice()` to get `formatUsd`
- Add USD next to every SOL value in the breakdown:
  - Amount row
  - Fee row
  - Pool Contribution row
  - Estimated Reward row
- Show USD next to the minimum amount note

### Files changed
- `src/components/predictions/FightCard.tsx` — add `useSolPrice`, show USD next to all 3 SOL displays
- `src/components/predictions/PredictionModal.tsx` — add `useSolPrice`, show USD next to all 4 breakdown rows

