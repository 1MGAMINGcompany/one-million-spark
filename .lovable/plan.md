

# Fix: Show Game Buttons Alongside Funding Card for Privy Users

## Problem

When a Privy user signs up and gets an embedded wallet with 0 SOL, the home page replaces all game buttons with a "Add Funds" card. The user loses access to Quick Match (free) and Play vs AI (free) -- features that don't require any SOL.

**Root cause:** Line 109 in `Home.tsx` uses a ternary: `showFundingCard ? <AddSolCard /> : <all buttons>`. This hides ALL buttons when the funding card is shown.

## Fix

Change the layout so the `AddSolCard` is shown **above** the buttons, not **instead of** them. Remove the ternary and always render the CTA buttons.

**File: `src/pages/Home.tsx`**

Replace the ternary block (lines 109-173) with:

1. Render `AddSolCard` conditionally above the buttons (compact informational banner)
2. Always render the full CTA button group below it

```
{/* Funding hint for Privy users with zero balance */}
{showFundingCard && (
  <AddSolCard walletAddress={walletAddress} balanceSol={balanceSol} />
)}

{/* CTA Buttons — always visible */}
<div className="flex flex-col gap-4 mt-4">
  ... (Quick Match, Play AI, Create Room, View Rooms buttons — unchanged)
</div>

{/* Stats/Trust indicators — unchanged */}
{/* Live Activity — unchanged */}
```

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Home.tsx` | Replace ternary with conditional AddSolCard + always-visible buttons |

## What Does NOT Change

- The dropdown menu (Navbar) -- not touched
- AddSolCard component itself -- unchanged
- Any game pages or wallet logic
