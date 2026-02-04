
# Fix Data Integrity Bug: Enforce winner_wallet Invariant in settle-game

## Problem Summary
The `settle-game` Edge Function has two code paths where it sets `status_int: 3` (finished) WITHOUT setting `winner_wallet`, causing finished games with null winners. This breaks payouts, audits, and confuses the UI.

### Problematic Paths Identified
1. **Vault Underfunded Path** (lines 766-784): Sets `status_int: 3` but only stores `intendedWinner` in `game_state` JSON
2. **Settlement Failed Catch Block** (lines 1103-1121): Same issue - `status_int: 3` without `winner_wallet`

### Correct Behavior (forfeit-game as reference)
The `forfeit-game` function correctly handles this:
- Cancel paths use `status: 'cancelled'` with `winner_wallet: null` (acceptable)
- Forfeit paths use `status: 'finished'` with `winner_wallet` properly set

## Solution Overview
Introduce a new terminal status `void` with `status_int: 4` for failed settlements that cannot determine/pay a winner. This preserves the invariant:

**Invariant: If `status_int = 3` (finished), then `winner_wallet` MUST be non-null**

## Implementation Details

### File: `supabase/functions/settle-game/index.ts`

#### Change 1: Vault Underfunded Path (lines 766-784)
**Before:**
```typescript
await supabase
  .from("game_sessions")
  .update({
    status: "finished",
    status_int: 3,
    game_state: { ...existingState, voidSettlement: true, ... },
    updated_at: new Date().toISOString(),
  })
```

**After:**
```typescript
await supabase
  .from("game_sessions")
  .update({
    status: "void",
    status_int: 4,
    game_over_at: new Date().toISOString(),
    game_state: { ...existingState, voidSettlement: true, reason: "vault_underfunded", intendedWinner: winnerWallet, ... },
    updated_at: new Date().toISOString(),
  })
```

#### Change 2: Settlement Failed Catch Block (lines 1103-1121)
**Before:**
```typescript
await supabase
  .from("game_sessions")
  .update({
    status: "finished",
    status_int: 3,
    game_state: { ...existingState, voidSettlement: true, reason: "settlement_failed", ... },
    updated_at: new Date().toISOString(),
  })
```

**After:**
```typescript
await supabase
  .from("game_sessions")
  .update({
    status: "void",
    status_int: 4,
    game_over_at: new Date().toISOString(),
    game_state: { ...existingState, voidSettlement: true, reason: "settlement_failed", intendedWinner: winnerWallet, ... },
    updated_at: new Date().toISOString(),
  })
```

#### Change 3: Add Safety Guard Before Standard Finish Update (near line 981)
Add a safety check before the success path update to prevent any future bugs:

```typescript
// SAFETY: Never set status_int=3 without winner_wallet
if (!winnerWallet) {
  console.error("[settle-game] ❌ INVARIANT VIOLATION: Attempted status_int=3 without winnerWallet");
  // Fall back to void status
  await supabase
    .from("game_sessions")
    .update({
      status: "void",
      status_int: 4,
      game_over_at: new Date().toISOString(),
      game_state: { voidSettlement: true, reason: "missing_winner" },
      updated_at: new Date().toISOString(),
    })
    .eq("room_pda", roomPda);
  
  // Continue to return but log the anomaly
}
```

## Status Values After Change

| Status | status_int | winner_wallet | Use Case |
|--------|------------|---------------|----------|
| waiting | 1 | null | Lobby |
| active | 2 | null | Game in progress |
| finished | 3 | REQUIRED | Normal game completion |
| cancelled | 3 | null | Room cancelled before start |
| void | 4 | null (ok) | Settlement failed, funds stuck |

## Files Changed
1. `supabase/functions/settle-game/index.ts`

## No Changes Required
- `supabase/functions/forfeit-game/index.ts` - Already correct
- Play vs AI code - Not touched
- Database schema - No migration needed (status_int already supports any integer)

## Test Plan

### Test 1: Normal Settlement
- Create ranked chess 2p game
- Play to completion
- Verify: `status_int=3`, `winner_wallet` is set

### Test 2: Simulate Vault Underfunded (requires manual test)
- If testable: verify `status='void'`, `status_int=4`, `game_over_at` set, `winner_wallet` null

### Test 3: Verify Forfeit Still Works
- Create room, both accept
- One player forfeits
- Verify: `status_int=3`, `winner_wallet` is opponent

### Test 4: Query Integrity Check
After deployment, run:
```sql
SELECT room_pda, status, status_int, winner_wallet 
FROM game_sessions 
WHERE status_int = 3 AND status = 'finished' AND winner_wallet IS NULL;
```
Should return 0 rows for new games.
