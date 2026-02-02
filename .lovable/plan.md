
# Fix Plan: Session Token Overwriting Bug in ranked-accept

## Problem Summary

When creating a ranked room, the session token is being **overwritten** during the `ranked-accept` call, causing subsequent API calls to fail with "Session not found".

## Root Cause Analysis

The room creation flow has a critical sequencing bug:

```text
1. record_acceptance RPC → Creates token in player_sessions (e.g., "62df498d...")
2. storeSessionToken() → Stores token in localStorage
3. ranked-accept called with that token in Authorization header → ✅ requireSession passes
4. ranked-accept simple mode (lines 265-266) → Generates NEW token: crypto.randomUUID()
5. ranked-accept upsert (lines 291-310) → OVERWRITES player_sessions row with NEW token
6. game-session-set-settings called with ORIGINAL token from localStorage
7. DB lookup fails → "Session not found" ❌
```

The `ranked-accept` function generates a fresh UUID token for "simple" acceptance mode and upserts it to `player_sessions`, overwriting the original token that the frontend already stored.

## Solution

Modify `ranked-accept` to **reuse the existing session token** from the Authorization header in simple mode, instead of generating a new one.

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/ranked-accept/index.ts` | Use existing session token instead of generating new one for simple mode |

## Implementation Details

### Change in `ranked-accept/index.ts` (Lines 258-311)

**Current code (problematic):**
```typescript
} else {
  // SIMPLE ACCEPTANCE FLOW
  console.log("[ranked-accept] Simple acceptance mode for:", playerWallet.slice(0, 8));

  // Generate session token and record
  const nonce = crypto.randomUUID();
  sessionToken = crypto.randomUUID();  // ❌ NEW TOKEN - overwrites DB
  signatureForRecord = "implicit_stake_acceptance";
  
  // ... upsert to game_acceptances and player_sessions with new token
}
```

**Fixed code:**
```typescript
} else {
  // SIMPLE ACCEPTANCE FLOW
  console.log("[ranked-accept] Simple acceptance mode for:", playerWallet.slice(0, 8));

  // CRITICAL FIX: Reuse the existing session token from the Authorization header
  // This prevents overwriting the token that the frontend already stored
  sessionToken = sessionResult.session.token;  // ✅ REUSE existing token
  const nonce = crypto.randomUUID();
  signatureForRecord = "implicit_stake_acceptance";
  
  // Record acceptance in game_acceptances (for dice roll seeding)
  const { error: acceptanceError } = await supabase
    .from("game_acceptances")
    .upsert({
      room_pda: body.roomPda,
      player_wallet: playerWallet,
      nonce,
      timestamp_ms: now,
      signature: signatureForRecord,
      rules_hash: "stake_verified",
      session_token: sessionToken,  // Use existing token
      session_expires_at: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'room_pda,player_wallet' });

  // ... rest stays the same, but player_sessions upsert should NOT change session_token
  
  // Update player_sessions WITHOUT overwriting session_token (only update metadata)
  const { error: sessionError } = await supabase
    .from("player_sessions")
    .update({
      rules_hash: "stake_verified",
      last_turn: 0,
      last_hash: "genesis",
      revoked: false,
    })
    .eq("room_pda", body.roomPda)
    .eq("wallet", playerWallet);
}
```

The key changes are:
1. Use `sessionResult.session.token` instead of `crypto.randomUUID()` for the session token
2. Change the `player_sessions` upsert to an `update` that doesn't touch `session_token`

## Why This Fix Works

1. `record_acceptance` creates the authoritative session token and stores it in `player_sessions`
2. Frontend stores this token in localStorage
3. `ranked-accept` receives this token via Authorization header
4. Instead of generating a new token, it reuses the one from the header
5. The `player_sessions` update only modifies metadata, not the token
6. `game-session-set-settings` uses the same token → DB lookup succeeds

## Testing Steps

After implementation:
1. Create a ranked chess room with 15 second turn timer
2. Verify console shows `[CreateRoom] stored session token for room...`
3. Verify NO "Room Settings Failed" modal appears
4. Check edge function logs - `game-session-set-settings` should succeed
5. Verify `turn_time_seconds` in database is 15 (not default 60)

## Technical Notes

The `sessionResult.session.token` is available because `requireSession` already validated and returned the token from the Authorization header. This is secure because:
- The token was already validated against `player_sessions` in `requireSession`
- We're not trusting any client-provided value - just reusing what was already authenticated
- The wallet is still derived from the session, not from the request body
