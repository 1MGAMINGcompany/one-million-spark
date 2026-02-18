

# Fix Free Match Logic in Quick Match

## Problem

Selecting "Free" (stake = 0) and pressing "Find Match" triggers the full on-chain room creation flow -- `createRoom()` sends a Solana transaction, checks for blocking rooms, calls `record_acceptance`, etc. This causes errors like "No blocking/active room detected in state" because free matches shouldn't use paid infrastructure at all.

## Solution

Short-circuit the `handleFindMatch` function when `selectedStake === 0`: instead of creating an on-chain room and waiting for an opponent, route directly to the AI practice page for the selected game. Free matches become instant single-player games against AI, bypassing all Solana, escrow, and session logic.

This is consistent with the existing "Play vs AI" timeout fallback and the "Free Practice" branding on the Play AI lobby.

## Changes

### File: `src/pages/QuickMatch.tsx`

**1. Update `handleFindMatch`** -- add an early return at the top of the try block (after the `hookBlockingRoom` check):

```typescript
// FREE MATCH: route directly to AI — no on-chain logic needed
if (selectedStake === 0) {
  navigate(`/play-ai/${selectedGameKey}?difficulty=medium`);
  return;
}
```

This goes before the `fetchRooms()` call, so no Solana RPC, no room creation, no `record_acceptance`, no session-set-settings calls happen for free games.

**2. Update the stake selector UI** -- optionally add a small hint under the "Free" button indicating it plays vs AI, so users understand the behavior. (The label "free" already exists.)

## What This Does NOT Touch

- Paid match flow (stake > 0) remains completely unchanged
- No Solana program, RPC, edge function, or DB changes
- No game logic, settlement, or timer changes
- The blocking room check for paid games still works as before

## Technical Details

- The AI game pages (`/play-ai/chess`, `/play-ai/dominos`, etc.) already accept a `?difficulty=medium` query param
- `selectedGameKey` is already derived and matches the AI route paths exactly (chess, dominos, backgammon, checkers, ludo)
- The `hookBlockingRoom` check before the early return is preserved so users with an existing paid room are still warned before navigating away

## Files Modified

| File | Change |
|------|--------|
| `src/pages/QuickMatch.tsx` | Add early return for free matches to navigate to AI page |

