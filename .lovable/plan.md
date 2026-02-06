
# Fix Plan: Settlement Failures + Remove Dice Roll Ceremony

## Problem Summary

Two critical issues are preventing games from starting and settling correctly:

### Issue 1: Forfeit Settlement Failing
When pressing the "Forfeit" button, the edge function call is not reaching the server. The logs show "No logs found for edge function 'forfeit-game'" despite the button being clicked. This indicates the request is failing before reaching the edge function.

**Root Cause**: The `useForfeit` hook sends `forfeitingWallet: myWallet` in the request body, but the `forfeit-game` edge function requires an `Authorization` header with a session token for identity verification (per memory `edge-function-identity-enforcement`). Without proper authentication, the request may be rejected or fail to process.

### Issue 2: Dice Roll UI Appearing
According to the architectural decision in memory `game-start-creator-first-no-dice`, all PvP games should skip the dice roll ceremony entirely. The creator (player1) should always start immediately when the room activates. However, the code still renders `DiceRollStart` component inside `RulesGate`.

**Root Cause**: The `useStartRoll` hook and `DiceRollStart` component are still active. The memory states that `maybe_finalize_start_state` should automatically set `starting_player_wallet` to `player1_wallet` and `start_roll_finalized=true` when the room reaches active status, but the frontend still shows the dice roll UI while waiting for this finalization.

## Solution

### Fix 1: Forfeit Settlement - Add Authentication Token

Modify `useForfeit.ts` to include the session token from `player_sessions` when calling the forfeit-game edge function. This ensures the request is properly authenticated and the edge function can verify the caller's identity.

The `finalizeGame.ts` function calls `supabase.functions.invoke()` which should automatically include auth headers if the user is signed in. However, the app uses Solana wallet auth (not Supabase email auth), so we need to:
1. Fetch or create a session token from `player_sessions`
2. Include it in the Authorization header

### Fix 2: Remove Dice Roll UI - Skip DiceRollStart Entirely

Update all game pages to skip the `DiceRollStart` component when `start_roll_finalized` is already true in the database. The database function should auto-finalize when both players are ready, and the frontend should simply wait for this flag before starting the game.

Changes needed:
1. In `RulesGate.tsx`: When `startRollFinalized` prop is true, render children directly instead of showing `DiceRollStart`
2. The `DiceRollStart` component should only appear as a fallback if something goes wrong with auto-finalization

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/RulesGate.tsx` | Skip to game when `startRollFinalized` is true - don't render children that include DiceRollStart |
| `src/pages/BackgammonGame.tsx` | Simplify the dice roll gate - only show DiceRollStart if `!startRoll.isFinalized` AND in fallback mode |
| `src/pages/ChessGame.tsx` | Same simplification |
| `src/pages/CheckersGame.tsx` | Same simplification |
| `src/pages/DominosGame.tsx` | Same simplification |
| `src/pages/LudoGame.tsx` | Same simplification |
| `src/lib/finalizeGame.ts` | Add session token retrieval and include Authorization header |
| `src/hooks/useForfeit.ts` | Ensure proper auth is passed through to finalizeGame |

## Technical Details

### For Fix 1 (Settlement Auth):

The forfeit-game edge function has debug logging that should appear when hit:
```typescript
console.log("[forfeit-game] HIT", { ts, method, url });
```

Since no logs are appearing, the request is failing before reaching the function. This could be:
1. CORS issue (unlikely - other edge functions work)
2. Network timeout before reaching Supabase
3. Missing or invalid authorization

The fix involves ensuring `supabase.functions.invoke()` includes the session token. Since the app uses Solana wallet auth, we need to either:
- Use the existing `player_sessions` token if available
- Or ensure the anon key allows the function to be called (it should)

### For Fix 2 (Skip Dice Roll):

Current flow:
```text
RulesGate (wait for both ready)
  └─> DiceRollStart (wait for roll) 
        └─> Game Board
```

New flow per `game-start-creator-first-no-dice`:
```text
RulesGate (wait for both ready)
  └─> IF start_roll_finalized: 
        └─> Game Board (immediately)
      ELSE (fallback only):
        └─> DiceRollStart
              └─> Game Board
```

The database already has `maybe_finalize_start_state` which sets:
- `starting_player_wallet = player1_wallet`
- `start_roll_finalized = true`
- `current_turn_wallet = player1_wallet`

This happens when the room activates. The frontend just needs to respect this flag.

### Code Changes Required:

**In BackgammonGame.tsx (and other game pages), update the RulesGate section:**

Currently:
```tsx
<RulesGate ... startRollFinalized={startRoll.isFinalized}>
  <DiceRollStart ... />
</RulesGate>
```

Change to:
```tsx
<RulesGate ... startRollFinalized={startRoll.isFinalized}>
  {startRoll.isFinalized ? null : (
    <DiceRollStart ... />
  )}
</RulesGate>
```

**AND in RulesGate.tsx**, when `startRollFinalized` is true, the gate should render `null` (not children) because the game board is rendered separately after the gate.

Actually, looking at the code more carefully, the issue is that `DiceRollStart` is passed as children to `RulesGate`, and `RulesGate` renders children when `effectiveBothReady` is true. The `startRollFinalized` prop is only used to bypass the gate early.

The fix should ensure that when `startRollFinalized` is true, neither the gate NOR the DiceRollStart should appear - just go straight to the game.

## Expected Behavior After Fix

1. **Forfeit**: When user presses Forfeit, the edge function receives the request, processes the on-chain settlement, and returns success. User is navigated to room list.

2. **Game Start**: When both players join and are ready, the game starts immediately with player1 (creator) going first. No dice roll UI appears.
