

# CRITICAL FIX: Forfeit-Game Identity Spoofing Exploit

## The Problem

An attacker (wallet `4nQha4dV`) exploited your game twice by calling the `forfeit-game` edge function with YOUR wallet address as the `forfeitingWallet`. The function has **no caller identity verification** -- it trusts whatever wallet address is sent in the request body.

This is a critical vulnerability: anyone can forfeit anyone else's game and steal their SOL.

## Evidence

Both games (DxHGKhY1 and JDpWu962) show the same pattern:
- Opponent joins, game ends within 13-15 seconds
- Zero game moves recorded
- Your wallet listed as `forfeiting_wallet` in settlement logs
- Opponent received the payout

## Fix: Two Changes Required

### Fix 1: Add `requireSession()` identity check to `forfeit-game` edge function

**File:** `supabase/functions/forfeit-game/index.ts`

The edge function must verify that the caller's session token matches the `forfeitingWallet` they claim to be forfeiting for. The caller can only forfeit THEIR OWN game, not someone else's.

Add at the top of the request handler (after body parsing):

```text
// SECURITY: Derive caller wallet from session token
// The forfeitingWallet in the body MUST match the authenticated caller
const authHeader = req.headers.get("Authorization");
if (authHeader) {
  const token = authHeader.replace("Bearer ", "");
  const { data: sessionRow } = await supabase
    .from("player_sessions")
    .select("wallet")
    .eq("session_token", token)
    .eq("room_pda", roomPda)
    .eq("revoked", false)
    .maybeSingle();

  if (sessionRow && sessionRow.wallet !== forfeitingWallet) {
    // BLOCKED: Caller is trying to forfeit someone else
    return json200({ success: false, error: "IDENTITY_MISMATCH" });
  }
}
```

**Exception:** Server-to-server calls (from `game-session-get` auto-forfeit) use the service role key in the Authorization header, which bypasses this check. These are trusted internal calls.

### Fix 2: Protect `finish_game_session` from participant manipulation

**Database migration:**

The `finish_game_session` RPC currently allows any participant to set `winner_wallet`. Add a guard: only allow setting `winner_wallet` if the session's `status_int` is still 2 (active) AND there's evidence of a completed game (moves exist in `game_moves`).

```sql
-- Only allow winner_wallet to be set if game has actual moves
IF p_winner_wallet IS NOT NULL THEN
  IF NOT EXISTS (
    SELECT 1 FROM game_moves WHERE room_pda = p_room_pda LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot set winner without game moves';
  END IF;
END IF;
```

### Fix 3: Add minimum game duration guard to `forfeit-game`

Prevent forfeits within the first 30 seconds of a game starting. If a game just started, no one should be forfeiting yet.

```text
// In forfeit-game edge function, after fetching game session:
const session = await supabase.from("game_sessions")
  .select("turn_started_at, status_int")
  .eq("room_pda", roomPda)
  .single();

if (session.data) {
  const gameAgeSeconds = (Date.now() - new Date(session.data.turn_started_at).getTime()) / 1000;
  if (gameAgeSeconds < 30 && session.data.status_int === 2) {
    return json200({ success: false, error: "GAME_TOO_NEW", details: "Cannot forfeit within 30 seconds of game start" });
  }
}
```

## Files Changed

| File | Change | Risk |
|------|--------|------|
| `supabase/functions/forfeit-game/index.ts` | Add session-based identity verification + minimum game age guard | Low -- additive check, existing auto-forfeit path (service role) unaffected |
| Database migration | Add move-existence guard to `finish_game_session` | Low -- only blocks setting winner when no moves exist |

## What This Does NOT Change

- No wallet logic changes
- No game engine changes
- No UI changes
- The auto-forfeit path (server-to-server via `game-session-get`) continues to work because it uses the service role key
- Manual forfeit by the actual player continues to work because their session token matches their wallet

## Testing Plan

1. After deploying, attempt to call `forfeit-game` with a mismatched wallet -- should return `IDENTITY_MISMATCH`
2. Verify normal forfeit still works (player forfeits their own game)
3. Verify auto-forfeit (3 strikes timeout) still works via `game-session-get`
4. Verify `finish_game_session` rejects winner-setting when no moves exist

