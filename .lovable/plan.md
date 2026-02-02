

## Fix requireSession.ts Schema Mismatch

### Problem Identified
The `requireSession.ts` shared function queries columns that don't exist in the `player_sessions` table:

| Current Code | Actual Table Schema |
|-------------|---------------------|
| `player_wallet` | `wallet` |
| `session_expires_at` | Does not exist |

This causes "Session lookup error" when `forfeit-game` edge function validates the caller.

### Changes Required

**File:** `supabase/functions/_shared/requireSession.ts`

1. **Remove `expiresAt` from SessionInfo type** (Line 7)
   - The `player_sessions` table doesn't have expiry tracking
   - Uses `revoked` flag instead

2. **Fix SELECT query** (Line 33)
   - Change from: `.select("player_wallet, session_expires_at, revoked")`
   - Change to: `.select("wallet, revoked")`

3. **Remove expiry check** (Lines 24, 40-42)
   - Delete `const nowIso = new Date().toISOString();`
   - Delete the `session_expires_at` validation block

4. **Fix wallet extraction** (Line 44)
   - Change from: `data.player_wallet`
   - Change to: `data.wallet`

5. **Simplify return** (Line 47)
   - Change from: `{ token, wallet, expiresAt: data.session_expires_at }`
   - Change to: `{ token, wallet }`

### Updated Code

```typescript
// supabase/functions/_shared/requireSession.ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type SessionInfo = {
  token: string;
  wallet: string;
};

export async function requireSession(
  supabase: SupabaseClient,
  req: Request
): Promise<{ ok: true; session: SessionInfo } | { ok: false; error: string }> {
  const auth =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, error: "Missing Authorization: Bearer <session_token>" };
  }

  const token = auth.slice(7).trim();
  if (!token || token.length < 24) {
    return { ok: false, error: "Invalid session token format" };
  }

  // player_sessions schema (actual):
  // session_token, room_pda, wallet, revoked, rules_hash, last_turn, last_hash, last_move_at, desync_count, created_at
  const { data, error } = await supabase
    .from("player_sessions")
    .select("wallet, revoked")
    .eq("session_token", token)
    .maybeSingle();

  if (error) return { ok: false, error: `Session lookup error: ${error.message}` };
  if (!data) return { ok: false, error: "Session not found" };
  if (data.revoked) return { ok: false, error: "Session revoked" };

  const wallet = String((data as any).wallet || "").trim();
  if (!wallet) return { ok: false, error: "Session missing wallet" };

  return { ok: true, session: { token, wallet } };
}
```

### Post-Fix Verification

After saving, confirm:
- Query uses `.select("wallet, revoked")` 
- No references to `player_wallet` or `session_expires_at`
- Returns `{ ok: true, session: { token, wallet } }`

### Testing

After deployment, repeat the timeout test:
1. Start a ranked Backgammon game
2. Let turn timer expire 3 times
3. Verify `forfeit-game` edge function succeeds
4. Confirm on-chain settlement completes

