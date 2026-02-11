
# Fix Auto-Forfeit: Two Critical Bugs

## Bug 1: Field Name Mismatch (ALL games broken)

The `maybe_apply_turn_timeout` RPC returns `action` in its response:
- `action: 'turn_timeout'` (single strike)
- `action: 'auto_forfeit'` (3 strikes)

But ALL game pages check `result.type` instead of `result.action`. This means the response is **always silently ignored** -- even when the RPC successfully applies a timeout, the client never processes it.

**Affected files (5):**
- `src/pages/ChessGame.tsx` (lines 535, 549)
- `src/pages/CheckersGame.tsx` (lines 461, 474)
- `src/pages/DominosGame.tsx` (lines 638, 650)
- `src/pages/LudoGame.tsx` (lines 508, 515)
- `src/pages/BackgammonGame.tsx` (lines 828, 832, 1161, 1175)

**Fix:** Change every `result.type` to `result.action` in all 5 files.

---

## Bug 2: No Polling for Opponent Timeout (Chess, Checkers, Dominos, Ludo)

Backgammon has a dedicated polling effect (~line 749) that:
1. Polls `game-session-get` every few seconds
2. Detects if it's the opponent's turn
3. Calls `maybe_apply_turn_timeout` to advance the game if the opponent is idle
4. Detects game-over from DB

Chess, Checkers, Dominos, and Ludo **do not have this**. The `useTurnTimer` hook only runs when `isMyTurn === true`, so it only handles self-timeout. If both players are online but the opponent is AFK, nothing triggers their timeout -- nobody calls the RPC.

**Fix:** Add a polling effect to Chess, Checkers, Dominos, and Ludo similar to Backgammon's. The poll:
- Runs every 3-5 seconds when the game is active and ranked
- Calls `game-session-get` (which itself calls `maybe_apply_turn_timeout` server-side for active games)
- Detects `current_turn_wallet` changes and game completion from DB
- Handles timeout results using `result.action` (not `result.type`)

---

## Technical Details

### File Changes

1. **`src/pages/ChessGame.tsx`**
   - Fix `result.type` to `result.action` in `handleTurnTimeout` (2 occurrences)
   - Add polling effect after `useTurnTimer` that polls `game-session-get` every 3s when ranked, active, and it's the opponent's turn; detects turn changes and game-over

2. **`src/pages/CheckersGame.tsx`**
   - Fix `result.type` to `result.action` (2 occurrences)
   - Add same polling effect

3. **`src/pages/DominosGame.tsx`**
   - Fix `result.type` to `result.action` (2 occurrences)
   - Add same polling effect

4. **`src/pages/LudoGame.tsx`**
   - Fix `result.type` to `result.action` (2 occurrences)
   - Add same polling effect

5. **`src/pages/BackgammonGame.tsx`**
   - Fix `result.type` to `result.action` (4 occurrences: 2 in polling, 2 in handleTurnTimeout)

### No Backend Changes Needed

The `maybe_apply_turn_timeout` RPC is correct -- it returns `action`. The `game-session-get` edge function already calls the RPC for active games. The bug is purely client-side field name mismatch + missing polling in 4 games.

### How It Works After Fix

```text
Scenario: Player A lets their turn expire (30s chess)

1. Player A's client: useTurnTimer counts to 0, fires handleTurnTimeout
   -> Calls maybe_apply_turn_timeout RPC
   -> RPC returns { applied: true, action: "turn_timeout", strikes: 1 }
   -> Client reads result.action (FIXED), shows "Turn skipped 1/3"

2. Player B's client: Polling effect detects turn change
   -> game-session-get returns updated current_turn_wallet
   -> Player B sees "Your turn" and timer resets

3. After 3 consecutive timeouts:
   -> RPC returns { applied: true, action: "auto_forfeit", winnerWallet: B }
   -> Client processes forfeit, shows game-over screen
   -> Server-side auto-settlement via game-session-get handles payout
```
