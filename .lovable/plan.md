

# Fix Recover Funds Errors

## Two Errors Found

### Error 1: "Non-base58 character"
**Cause:** There is one game session in the database with a UUID as its `room_pda` value (`5fa5b7cd-2d4f-44be-b2f7-e83f490583ec`) instead of a valid Solana base58 address. When the Recover Funds button sends this to the backend, it crashes because UUIDs contain hyphens which are not valid in Solana addresses.

**Fix (two parts):**

1. **Clean up the bad data** -- Delete or update the invalid database row:
   ```sql
   DELETE FROM game_sessions WHERE room_pda = '5fa5b7cd-2d4f-44be-b2f7-e83f490583ec';
   ```

2. **Add validation in the edge function** -- Before attempting to create a Solana PublicKey, validate that the `roomPda` string is a valid base58 address. If not, return a clear 400 error instead of crashing with a 500.

3. **Add client-side guard** -- In `RecoverableRoomsSection.tsx`, filter out any rooms whose `room_pda` contains hyphens (UUIDs) before displaying them, so the Recover button never appears for invalid rooms.

---

### Error 2: "Verifier key mismatch with on-chain config"
**Cause:** The `VERIFIER_SECRET_KEY` secret stored in the backend environment produces a public key that does not match the verifier registered in the on-chain program config. This means the force-settle (stale game recovery) path will always fail.

**Fix:** This is a configuration issue, not a code issue. The `VERIFIER_SECRET_KEY` secret needs to be updated to match the keypair whose public key is registered as the verifier in the on-chain config account. This requires whoever deployed the Solana program to provide the correct verifier secret key.

No code change can fix this -- it's the wrong key. The edge function's error handling is already correct (it detects the mismatch and reports it clearly).

---

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/recover-funds/index.ts` | Add base58 validation for `roomPda` before using it, return 400 for invalid values |
| `src/components/RecoverableRoomsSection.tsx` | Filter out rooms with non-base58 `room_pda` values |
| Database | Delete the invalid row with UUID `room_pda` |

## Technical Details

**Edge function validation (recover-funds/index.ts):**
After the existing null check for `roomPda`, add a base58 format check:
```typescript
// Validate roomPda is a valid base58 Solana address
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
if (!BASE58_REGEX.test(roomPda)) {
  return new Response(
    JSON.stringify({ status: "error", message: "Invalid room address format" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Client-side filter (RecoverableRoomsSection.tsx):**
After receiving rows from the edge function, filter invalid PDAs:
```typescript
const rows = (resp?.rows ?? []).filter(
  (r: RecoverableRoom) => r.room_pda && !r.room_pda.includes('-')
);
```

**Verifier key:** The `VERIFIER_SECRET_KEY` environment secret must be updated to the correct keypair. This is something you (the project owner) need to verify matches your on-chain program deployment. Check your Solana program's config account to find the expected verifier public key, then update the secret accordingly.

