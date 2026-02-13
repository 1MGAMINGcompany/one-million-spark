

# Lock Down `finalize_receipts` Table (RLS-Only Fix)

## Current State

The `finalize_receipts` table has a permissive SELECT policy `using (true)`, meaning any anonymous client can read all settlement transaction signatures and room PDAs. This leaks internal settlement data.

## Why This Is Safe to Change

The frontend **never reads `finalize_receipts` directly**. All client-side receipt checks go through:
- `game-session-get` edge function (uses service role key, bypasses RLS)
- `isRoomFinalized()` in `finalizeGame.ts` calls `game-session-get`, not the table

Edge functions (`forfeit-game`, `settle-game`, `settle-draw`) write to the table using service role, so they are also unaffected by RLS changes.

## Change

**Single migration** -- replace the permissive public-read policy with a restrictive one:

```sql
-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "public read receipts" ON finalize_receipts;

-- New policy: only room participants can read their own receipts
CREATE POLICY "participants_read_receipts"
ON finalize_receipts FOR SELECT
USING (false);
```

We use `USING (false)` because:
1. No client-side code reads this table directly (confirmed by search)
2. All legitimate reads go through edge functions using the service role (which bypasses RLS entirely)
3. There is no `auth.uid()` in this app (wallet-based identity, no Supabase Auth) so a participant-join policy would have no way to identify the requester

This is the same pattern already used for `settlement_logs`, `player_sessions`, `session_nonces`, and `game_moves`.

## Files Changed

| File | Change |
|------|--------|
| New migration SQL | Drop `public read receipts`, create `participants_read_receipts` with `USING (false)` |

**Zero frontend changes required.**

## What Will NOT Break

- Edge functions (service role) bypass RLS -- all writes and reads from `game-session-get`, `forfeit-game`, `settle-game`, `settle-draw` continue working
- `isRoomFinalized()` calls `game-session-get` edge function, not the table directly
- `record_match_result` RPC runs as SECURITY DEFINER, bypasses RLS
- No client-side code queries `finalize_receipts` directly (verified by codebase search)

