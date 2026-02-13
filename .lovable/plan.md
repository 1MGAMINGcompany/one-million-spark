

# Hardening All Edge Functions with Session-Based Identity

## Current Security Status

After the forfeit-game patch, here is the status of every state-changing edge function:

| Function | Status | Risk | Issue |
|---|---|---|---|
| forfeit-game | PATCHED | - | Identity check + 30s cooldown added |
| submit-move | VULNERABLE | HIGH | Trusts `wallet` from request body -- attacker could submit moves as another player |
| settle-game | SAFE | - | Derives winner from on-chain data + game_state, no body wallet trusted for identity |
| settle-draw | SAFE | - | Uses only on-chain room data, no body wallet for identity |
| recover-funds | LOW RISK | LOW | `callerWallet` from body only controls who receives a cancel_room unsigned tx -- actual on-chain tx still requires wallet signature |
| game-session-set-settings | LOW RISK | LOW | `creatorWallet` compared against DB player1_wallet, and only works pre-game. No funds at risk |
| set-manual-starter | LOW RISK | LOW | `callerWallet` checked against DB participants. Only affects who goes first, pre-game only |
| ranked-accept | SAFE | - | Validation-only stub, no DB writes |

## What Needs Fixing

### Priority 1: submit-move (HIGH risk)

This is the only remaining critical vulnerability. The edge function accepts `wallet` from the request body and passes it directly to the `submit_game_move` RPC. An attacker could:
- Submit moves on behalf of another player
- Manipulate game state to force a win

The RPC does check `current_turn_wallet`, but an attacker could time their call during the victim's turn to submit a bad move.

**Fix:** Add session token verification identical to the forfeit-game pattern. The client already sends an Authorization header via the Supabase client (the anon key). We add a check: if a session token is provided, derive the wallet from `player_sessions` and reject mismatches.

### Priority 2: recover-funds, game-session-set-settings, set-manual-starter (LOW risk)

These are lower priority because:
- `recover-funds`: The callerWallet is only used to check if they're the creator for cancel_room, and the actual cancel requires the user's wallet to sign the Solana transaction client-side
- `game-session-set-settings`: Only works before game starts, compares against DB, no funds at risk
- `set-manual-starter`: Only affects first-move order, pre-game only, validated against DB participants

Adding session checks to these would add defense-in-depth but is not exploitable for fund theft.

## Implementation Plan

### Step 1: Harden submit-move edge function

Add the same identity verification pattern used in forfeit-game:

```text
// After parsing body, before calling RPC:
const authHeader = req.headers.get("Authorization");
if (authHeader) {
  const token = authHeader.replace("Bearer ", "");
  // Skip if it's the anon key (not a session token)
  if (token.length === 64) {  // Session tokens are 64-char hex
    const { data: sessionRow } = await supabase
      .from("player_sessions")
      .select("wallet")
      .eq("session_token", token)
      .eq("room_pda", roomPda)
      .eq("revoked", false)
      .maybeSingle();

    if (sessionRow && sessionRow.wallet !== wallet) {
      return error response: IDENTITY_MISMATCH
    }
    // If session found, override wallet with verified one
    if (sessionRow) {
      wallet = sessionRow.wallet;
    }
  }
}
```

**Key design choice:** When a valid session token is found, we OVERRIDE the body wallet with the session-derived wallet. This makes the body wallet irrelevant for identity.

### Step 2 (Defense-in-depth): Add session checks to lower-risk functions

Apply the same pattern to `recover-funds`, `game-session-set-settings`, and `set-manual-starter`. These don't put funds at direct risk, but closing them prevents any future exploitation if the game logic changes.

## Files Changed

| File | Change | Risk |
|---|---|---|
| supabase/functions/submit-move/index.ts | Add session identity verification, override wallet from session | Low -- additive check, falls through gracefully if no session token |
| supabase/functions/recover-funds/index.ts | Add session identity verification for callerWallet | Very low -- existing on-chain signature requirement unchanged |
| supabase/functions/game-session-set-settings/index.ts | Add session identity verification for creatorWallet | Very low -- existing DB check unchanged |
| supabase/functions/set-manual-starter/index.ts | Add session identity verification for callerWallet | Very low -- existing DB participant check unchanged |

## What Will NOT Break

- All functions fall through gracefully if no session token is present (backward compatible)
- The Supabase client sends the anon key as Authorization by default -- this is not a 64-char hex string, so it won't trigger the session check
- Server-to-server calls use the service role key, which is also not a session token
- The `submit_game_move` RPC's existing `current_turn_wallet` check remains as a second layer of defense
- settle-game, settle-draw, and ranked-accept are NOT modified (already safe)

## Testing

1. Play a normal ranked game end-to-end -- moves should submit normally
2. Verify forfeit still works for the actual player
3. Attempt to call submit-move with a wallet that doesn't match the session -- should get IDENTITY_MISMATCH

