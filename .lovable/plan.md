

# Audit: Game Flow Alignment + Fixes

## Audit Results

### What matches your spec (working correctly)

1. **useTurnTimer hook** -- Server-anchored, counts down for both players, only turn holder triggers timeout RPC. Correct.
2. **submit_game_move RPC** -- Auto-flips turn for Chess/Checkers/Dominos, skips flip for Backgammon/Ludo. Correct.
3. **maybe_apply_turn_timeout RPC** -- Records turn_timeout, increments strikes, flips turn, 3 strikes = auto_forfeit. Correct.
4. **Auto-settlement** -- `useAutoSettlement` triggers `settle-game` when `winnerWallet` is set. Fires automatically via useEffect. Correct.
5. **Backgammon multi-move turns** -- Timer per turn (not per sub-move), dice roll + moves + explicit turn_end. Correct.
6. **Ludo elimination** -- 3 missed turns = elimination, game continues until 1 player remains. Correct.
7. **OpponentAbsenceIndicator** -- Shows strikes, countdown, and auto-forfeit progress. Correct.

### Issues Found (need fixing)

**Issue 1: Timer doesn't update after local move (all single-action games)**

When you make a chess/checkers/dominos move, the server updates `turn_started_at = NOW()`, but the client's `dbTurnStartedAt` state only updates on the next poll cycle (3-5 seconds later). During that gap:
- Your timer shows stale time from the previous turn
- The opponent's device also shows stale time until their poll catches up
- This creates the "all over the place" visual desync

**Fix**: After submitting a move locally, immediately set `dbTurnStartedAt` to the current time as a best-effort local estimate. The next poll will overwrite it with the authoritative server timestamp.

**Issue 2: "Settle" button flashing on win screen**

The `useAutoSettlement` hook fires when `winnerWallet` changes, but the settlement is async (takes 1-3 seconds for on-chain confirmation). During that window, the GameEndScreen may show a "Settle" button because `result` is still null. This is a UI timing issue -- the settlement IS automatic, but the button appears before it completes.

**Fix**: Pass `autoSettlement.isSettling` to GameEndScreen to hide/disable the settle button while auto-settlement is in progress.

**Issue 3: Stale rooms in room list**

Previous test sessions that weren't properly closed remain in `waiting` or `active` status. This is expected behavior for rooms that failed settlement or were abandoned before the 3-strike timeout completed. No code fix needed -- these will be cleaned up by the sweep-orphan-vault function or manual cleanup.

## Technical Changes

### 1. Chess, Checkers, Dominos: Set `dbTurnStartedAt` after local move

In each game's move handler, immediately after persisting the move, update the local timer anchor:

```typescript
// After persistMove call
setDbTurnStartedAt(new Date().toISOString());
```

Files:
- `src/pages/ChessGame.tsx` -- in `handleSquareClick` after `persistMove` (around line 1228)
- `src/pages/CheckersGame.tsx` -- in move handler after `persistMove`
- `src/pages/DominosGame.tsx` -- in move handler after `persistMove`

### 2. GameEndScreen: Hide settle button during auto-settlement

Pass `isSettling` from `useAutoSettlement` to `GameEndScreen` to suppress the manual settle button while the automatic process is running.

Files:
- `src/pages/ChessGame.tsx` -- pass `isSettling={autoSettlement.isSettling}` to GameEndScreen
- `src/pages/CheckersGame.tsx` -- same
- `src/pages/BackgammonGame.tsx` -- same
- `src/pages/DominosGame.tsx` -- same
- `src/pages/LudoGame.tsx` -- same
- `src/components/GameEndScreen.tsx` -- accept `isSettling` prop, hide settle button when true

### 3. Clean up harmless dead code (optional, low priority)

The `turnTimer.resetTimer()` calls scattered across polling handlers are no-ops and harmless. They can stay for now -- removing them is cosmetic cleanup only.

## What NOT to change

- `useTurnTimer.ts` -- already correct, no changes needed
- `submit_game_move` RPC -- auto-flip logic is correct
- `maybe_apply_turn_timeout` RPC -- grace period fix is already deployed
- `useAutoSettlement` -- logic is correct, only UI integration needs adjustment
- Backgammon turn flow -- multi-move turns working correctly
- Ludo elimination flow -- working correctly

## Summary

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | Set `dbTurnStartedAt` after local move; pass `isSettling` to GameEndScreen |
| `src/pages/CheckersGame.tsx` | Set `dbTurnStartedAt` after local move; pass `isSettling` to GameEndScreen |
| `src/pages/DominosGame.tsx` | Set `dbTurnStartedAt` after local move; pass `isSettling` to GameEndScreen |
| `src/pages/BackgammonGame.tsx` | Pass `isSettling` to GameEndScreen (timer already updates on turn_end) |
| `src/pages/LudoGame.tsx` | Pass `isSettling` to GameEndScreen |
| `src/components/GameEndScreen.tsx` | Accept `isSettling` prop; hide settle button while settling |

No database changes needed.

