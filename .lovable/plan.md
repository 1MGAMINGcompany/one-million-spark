

# Wire Session Token to Edge Function Calls

## The Gap

The identity hardening in `submit-move` (and other edge functions) checks for a 64-character hex session token in the `Authorization` header. However, the client (`useDurableGameSync.ts`) uses `supabase.functions.invoke()` which only sends the **anon key** (a JWT) -- so the identity check is never triggered.

The session token IS stored in `localStorage` as `session_token_{roomPda}`, but it's never attached to the edge function calls.

## Fix

Pass the session token as a **custom header** (not replacing the Authorization header, which Supabase needs for routing). The edge function already handles this -- the token regex check (`/^[0-9a-f]{64}$/`) will match.

### Option: Use a custom header instead

Since the `Authorization` header is controlled by the Supabase client (and contains the anon key), we should use a dedicated custom header like `x-session-token` and update both the client and all hardened edge functions to read from it.

### Changes

**1. Update `useDurableGameSync.ts`** -- pass session token as custom header

In the `submitMove` function, read the session token from localStorage and pass it:

```
const sessionToken = localStorage.getItem(`session_token_${roomPda}`);

const { data, error } = await supabase.functions.invoke("submit-move", {
  headers: sessionToken ? { "x-session-token": sessionToken } : undefined,
  body: { roomPda, wallet, moveData, clientMoveId },
});
```

**2. Update all 4 hardened edge functions** to read from `x-session-token` header instead of (or in addition to) `Authorization`

In `submit-move`, `forfeit-game`, `recover-funds`, `game-session-set-settings`, `set-manual-starter`:

```
// Read session token from dedicated header
const sessionToken = req.headers.get("x-session-token");
if (sessionToken && sessionToken.length === 64 && /^[0-9a-f]{64}$/.test(sessionToken)) {
  // ... existing identity verification logic using sessionToken
}
```

**3. Update client-side callers** for other edge functions

Search for all `supabase.functions.invoke("forfeit-game")`, `invoke("recover-funds")`, etc. and wire the session token header the same way.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useDurableGameSync.ts` | Read `session_token_{roomPda}` from localStorage, pass as `x-session-token` header |
| `supabase/functions/submit-move/index.ts` | Read token from `x-session-token` header instead of Authorization |
| `supabase/functions/forfeit-game/index.ts` | Same header change |
| `supabase/functions/recover-funds/index.ts` | Same header change |
| `supabase/functions/game-session-set-settings/index.ts` | Same header change |
| `supabase/functions/set-manual-starter/index.ts` | Same header change |
| Client callers for forfeit/recover/settings | Add `x-session-token` header to invoke calls |

## Risk

Low -- all edge functions still fall through gracefully if no session token is provided. The custom header approach avoids interfering with Supabase's own Authorization header. Existing gameplay is unaffected because the body wallet is still sent as a fallback.

## Testing

After this change, the edge function logs should show the session verification path being hit during normal gameplay, confirming the identity guard is actually active.

