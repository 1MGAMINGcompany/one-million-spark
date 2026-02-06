
# Fix Plan: Turn Timer Not Starting + Game Entry Blocked

## Root Cause Analysis

Based on the investigation, I found **multiple interconnected issues** blocking games from starting:

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| `game-session-get` 404 | Edge function wasn't deployed | Polling for readiness fails |
| `bothReady` never true | `record_acceptance` not setting flags | Games stuck on "Waiting" screen |
| Timer doesn't start | `effectiveIsMyTurn` is false until `currentTurnWallet` is set | No timeout enforcement |
| Dice roll blocking | `useStartRoll` returns `isFinalized: true` but session isn't created | Deadlock between session creation and UI |

### The Deadlock Explained

```text
1. useStartRoll says isFinalized=true immediately
2. RulesGate checks !isFinalized → false → never shows waiting UI
3. But useStartRoll also calls ensure_game_session which sets current_turn_wallet
4. Until that completes, currentTurnWallet is null → timer doesn't know whose turn it is
5. If game-session-get was 404ing, the polling never detected bothReady
```

---

## Fixes Required

### Fix 1: Edge Function Deployed ✅
The `game-session-get` edge function is now deployed - this was causing 404 errors and blocking all polling.

### Fix 2: Ensure `currentTurnWallet` Is Set Immediately

**File:** `src/hooks/useStartRoll.ts`

The hook should set the starting wallet in the database when both players are present. Currently it calls `ensure_game_session` but this RPC may not set `current_turn_wallet`.

**Current issue:** The `startingWallet` is returned but `currentTurnWallet` in the game state isn't updated until the session is created in DB.

**Solution:** After creating the session, trigger a refetch so `current_turn_wallet` is populated from the DB.

### Fix 3: Set `p1_ready`/`p2_ready` When Session Is Created

**File:** `src/hooks/useStartRoll.ts` or database RPC

When `ensure_game_session` is called with both players present, it should also mark both players as ready (since they've already staked to join).

**Add to `ensure_game_session` RPC or call separately:**
```sql
UPDATE game_sessions 
SET p1_ready = true, p2_ready = true, start_roll_finalized = true
WHERE room_pda = p_room_pda;
```

### Fix 4: RulesGate Should Pass Through When `hasTwoRealPlayers`

**File:** `src/components/RulesGate.tsx`

The gate should bypass immediately if:
1. Two real players are present
2. AND session creation is complete

Currently it waits for `effectiveBothReady` from polling, but the polling was broken.

**Alternative solution:** Add `hasTwoRealPlayers` as a bypass condition in RulesGate:

```typescript
// If we have two real players in the room, the game can proceed
// (they already staked to join - implicit acceptance)
if (roomPlayers.filter(p => !isPlaceholderWallet(p)).length >= 2) {
  return <>{children}</>;
}
```

### Fix 5: Initialize Timer with `startingWallet` from `useStartRoll`

**File:** `src/pages/BackgammonGame.tsx`

Ensure `currentTurnWallet` is set from `startRoll.startingWallet` immediately on mount, not just after an effect runs.

---

## Implementation Details

### Option A: Quick Fix (Database-side)

Modify the `ensure_game_session` RPC to:
1. Set `p1_ready = true` and `p2_ready = true` when both wallets are provided
2. Set `start_roll_finalized = true`
3. Set `current_turn_wallet = p_player1_wallet`

This ensures the DB is in the correct state as soon as both players join.

### Option B: Client-side Fix

Modify `useStartRoll.ts` to:
1. After calling `ensure_game_session`, call `supabase.rpc("record_acceptance")` for both players
2. OR call a new edge function that sets all the required flags

### Option C: Simplify RulesGate (Recommended)

Since we're in "Fast Start" mode where there's no dice roll:
1. RulesGate should pass through immediately when `hasTwoRealPlayers` is true
2. Remove the polling complexity since the decision is now simple

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/RulesGate.tsx` | Add bypass for `validPlayers.length >= 2` |
| `src/hooks/useStartRoll.ts` | Ensure session flags are set after creation |
| Database RPC `ensure_game_session` | Set ready flags and current_turn_wallet |

---

## Turn Timer Flow (After Fix)

```text
1. Both players in room (hasTwoRealPlayers = true)
2. RulesGate bypasses (new condition)
3. useStartRoll.startingWallet = roomPlayers[0] (creator)
4. setCurrentTurnWallet(startingWallet) runs immediately
5. Timer starts: enabled=true, isMyTurn=(creator sees true, joiner sees false)
6. Creator has 10s to roll dice and move
7. On timeout: turn_timeout recorded → currentTurnWallet changes to opponent
8. Timer resets on opponent's device
```

---

## Testing Checklist

After implementing:
1. Create a ranked Backgammon room with 10s timer
2. Have second player join immediately
3. Verify both players see the game board (not "Waiting for opponent")
4. Verify timer is counting down for Player 1 (creator)
5. Let timer expire - verify turn passes to Player 2
6. Let Player 2's timer expire - verify turn passes back to Player 1
7. Let 3 consecutive timeouts occur - verify auto-forfeit
