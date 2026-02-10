

# Fix: Auto-Forfeit Must Trigger On-Chain Payout

## Problem

When a player misses 3 consecutive turns, `maybe_apply_turn_timeout` correctly sets `status_int = 3` and `winner_wallet` in the database, but **no edge function is called** to execute the on-chain payout (`submit_result` + `close_room`). The winner never gets paid.

## Solution

Add a server-side internal call from `game-session-get` to `forfeit-game` immediately after `maybe_apply_turn_timeout` returns an `auto_forfeit` (or `auto_eliminate_and_finish`) result. This is the same polling endpoint both clients hit every few seconds, so it guarantees the payout fires regardless of which device detects the timeout.

## Implementation

### File: `supabase/functions/game-session-get/index.ts`

After the existing block (lines 80-103) that calls `maybe_apply_turn_timeout` and re-fetches the session, add:

```text
If turnTimeoutResult.action is "auto_forfeit" or "auto_eliminate_and_finish":

  1. Determine forfeitingWallet:
     - Use turnTimeoutResult.timedOutWallet (always present in the RPC result)
  
  2. Make an internal fetch to forfeit-game:
     fetch(`${supabaseUrl}/functions/v1/forfeit-game`, {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         "Authorization": `Bearer ${serviceKey}`,
       },
       body: JSON.stringify({
         roomPda,
         forfeitingWallet: turnTimeoutResult.timedOutWallet,
         winnerWallet: turnTimeoutResult.winnerWallet,  // optional override
         gameType: session.game_type,
       }),
     })
  
  3. Log the result (success or error) but do NOT block/fail
     the response -- the forfeit-game call is fire-and-forget
     from game-session-get's perspective.

  4. After the forfeit call, re-fetch:
     - game_sessions (already done)
     - finalize_receipts (fetched later in the function anyway)
     - matches (fetched later in the function anyway)
```

### Why this is safe

- **Idempotent**: `forfeit-game` already checks `settlement_logs` for existing successful forfeit entries and returns `alreadySettled: true` if found. Repeated polls will not double-pay.
- **No client wallet needed**: `forfeit-game` accepts `forfeitingWallet` in the body and uses the service role key for the on-chain transaction (verifier keypair signs).
- **No DB schema changes**: All tables (`settlement_logs`, `finalize_receipts`, `matches`, `match_share_cards`) already exist and are written to by `forfeit-game`.
- **No RPC function changes**: `maybe_apply_turn_timeout` already returns all needed fields (`timedOutWallet`, `winnerWallet`, `action`).

### Timing

The internal `forfeit-game` call may take 2-5 seconds (Solana transaction). The `game-session-get` response will be slightly delayed on the poll that triggers the auto-forfeit, but subsequent polls will be fast (idempotent check returns immediately).

### Files changed
- `supabase/functions/game-session-get/index.ts` -- one addition (~25 lines) after the turn timeout block

### No other files changed
- No DB migrations
- No client-side changes
- No changes to `forfeit-game` itself

