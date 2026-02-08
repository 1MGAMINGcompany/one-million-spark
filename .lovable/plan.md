
# Fix "Move Failed" Toast for Already-Rolled Dice

## Problem Identified

The opponent absence detection and auto-forfeit worked perfectly. Your test shows:

**Timeline:**
- 20:41:28 - Opponent timeout (strike 1) - Turn passes to you
- 20:41:51 - Opponent timeout (strike 2) - Turn passes to you
- 20:42:13 - Opponent timeout (strike 3) - AUTO-FORFEIT - You won!

**The Issue:** When the turn passed to you after an opponent timeout, your client tried to roll dice, but the server returned `already_rolled` error. This error is not handled gracefully - it shows a generic "Move failed" toast instead of being silently ignored.

From the logs:
```
[submit-move] RPC result: { error: "already_rolled", success: false }
```

## Root Cause

In `src/hooks/useDurableGameSync.ts`, the error handling switch statement (lines 169-246) handles many error types like:
- `turn_mismatch`
- `not_your_turn`
- `move_conflict`
- `timeout_too_early`

But `already_rolled` is **NOT** in the list, so it falls through to the default case which throws an error and shows:
```
toast.error("Move failed", { description: "Could not submit move to server" })
```

## Solution

Add `already_rolled` as a handled case that silently resyncs without showing an error toast. This is the expected behavior since the dice are already present - no user action needed.

## Technical Changes

### File: `src/hooks/useDurableGameSync.ts`

Add new case in the switch statement (around line 199):

```typescript
case "already_rolled":
  console.warn("[DurableSync] Dice already rolled this turn");
  dbg("durable.submit.already_rolled", {});
  // Silent - dice are already present, just refresh state
  await loadMoves();
  return false;
```

## Additional Polish (Optional)

Could also add handling for these edge cases that might occur during turn transitions:
- `game_finished` - Game already ended (don't show error)
- `invalid_move_type` - Wrong move type for current game state

## Testing

After fix, create a ranked Backgammon game where:
1. Creator closes browser after joining
2. Opponent waits for 3 timeout strikes
3. Verify no "Move failed" popups appear during the process
4. Verify auto-forfeit triggers and opponent wins
