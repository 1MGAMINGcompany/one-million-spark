

# Add Server-Side Timeout Enforcement to game-session-get

## Problem
`game-session-get` is read-only. If the opponent is offline, no client calls `maybe_apply_turn_timeout`, so turns stall indefinitely.

## Fix (single file: `supabase/functions/game-session-get/index.ts`)

### Change 1: Make `session` reassignable (line 38)

Change:
```typescript
const { data: session, error: sessionError } = await supabase
```
To:
```typescript
const { data: session1, error: sessionError } = await supabase
```
And add after line 50:
```typescript
let session = session1;
```

### Change 2: Insert timeout enforcement block (after the new `let session` line, before line 52)

```typescript
// Server-side timeout enforcement for active games
if (session && session.status_int === 2) {
  try {
    const { data: timeoutRes, error: timeoutErr } = await supabase.rpc(
      "maybe_apply_turn_timeout",
      { p_room_pda: roomPda }
    );

    if (timeoutErr) {
      console.warn("[game-session-get] maybe_apply_turn_timeout error (non-fatal):", timeoutErr);
    }

    if (timeoutRes?.applied) {
      console.log("[game-session-get] Timeout applied:", timeoutRes);
      const { data: session2, error: session2Err } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("room_pda", roomPda)
        .maybeSingle();

      if (!session2Err && session2) {
        session = session2;
      }
    }
  } catch (e) {
    console.warn("[game-session-get] maybe_apply_turn_timeout exception (non-fatal):", e);
  }
}
```

### What this does
- On every poll where `status_int === 2` (active game), the server calls the existing `maybe_apply_turn_timeout` RPC
- The RPC is idempotent: if the turn hasn't expired, it returns `{ applied: false }` and does nothing
- If a timeout fires (or an auto-forfeit on 3 strikes), we re-fetch the session so the response includes updated state
- Wrapped in try/catch so a failure never breaks the read path

### What this does NOT do
- No CORS changes
- No forfeit-game calls
- No readiness gating (no p1_ready/p2_ready checks)
- No changes to any other file

## Files changed
Only `supabase/functions/game-session-get/index.ts`

