

## Fix: Add `player_sessions` Upsert in Simple Acceptance Flow

### Problem Summary
When Player 2 joins a ranked game via simple acceptance mode (stake tx), a `game_acceptances` row is created but **no `player_sessions` row is created**. This causes `forfeit-game` to fail with "Session not found" when Player 2 tries to trigger a timeout forfeit.

| Table | Player 1 (creator) | Player 2 (joiner) |
|-------|-------------------|-------------------|
| `game_acceptances` | ✅ Has row | ✅ Has row |
| `player_sessions` | ✅ Has row (via `start_session` RPC) | ❌ **Missing** |

### Solution
Add a `player_sessions` upsert in the simple acceptance flow, matching what the signed flow achieves via the `start_session` RPC.

### File to Modify
`supabase/functions/ranked-accept/index.ts`

### Change Location
After line **269** (after the successful `game_acceptances` upsert log in simple mode), add the `player_sessions` upsert.

### Code to Add (Lines 269-282, insert after line 269)

```typescript
      // NEW: Also create player_sessions row (critical for forfeit-game)
      // This ensures the joiner (Player 2) can call server-verified timeout forfeit.
      const { error: sessionError } = await supabase
        .from("player_sessions")
        .upsert(
          {
            session_token: sessionToken,
            room_pda: body.roomPda,
            wallet: body.playerWallet,
            rules_hash: "stake_verified",
            last_turn: 0,
            last_hash: "genesis",
            revoked: false,
          },
          { onConflict: "room_pda,wallet" }
        );

      if (sessionError) {
        console.error("[ranked-accept] Failed to create player_session:", sessionError);
      } else {
        console.log("[ranked-accept] ✅ player_sessions row created for simple mode");
      }
```

### Schema Verification
The `player_sessions` table columns (from provided schema):
- `session_token` ✅
- `room_pda` ✅
- `wallet` ✅
- `revoked` ✅
- `rules_hash` ✅
- `last_turn` ✅ (default: 0)
- `last_hash` ✅ (nullable)
- `last_move_at` (nullable, not needed)
- `desync_count` (default: 0, not needed)
- `created_at` (auto-generated)

All fields in the upsert exist in the actual schema.

### Why This Works

1. **Matches existing pattern**: The `start_session` RPC (used by signed mode) creates `player_sessions` rows with the same structure
2. **Idempotent**: Using `onConflict: "room_pda,wallet"` prevents duplicates if called twice
3. **Both players covered**: Creator gets session via signed flow, joiner gets session via simple flow
4. **No schema changes needed**: Uses existing `player_sessions` table structure exactly

### Post-Implementation Verification

After deployment, run this query to confirm both players have sessions:
```sql
SELECT wallet, session_token, revoked, created_at 
FROM player_sessions 
WHERE room_pda = '<ROOM_PDA>' 
ORDER BY created_at DESC;
```
Expected: 2 rows (one per player)

### Testing Checklist
- [ ] Both players have `player_sessions` rows after accepting
- [ ] Timeout forfeit works for Player 2 (joiner)
- [ ] `forfeit-game` returns success instead of "Session not found"
- [ ] On-chain settlement completes

