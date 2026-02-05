# Fix Plan: Restore Game Acceptance Flow

## Status: ✅ COMPLETE

---

## Changes Completed

### 1. ✅ Fixed `record_acceptance` RPC to Insert into `game_acceptances`

Migration applied that adds the missing `INSERT INTO game_acceptances` statement with all required columns (`nonce`, `timestamp_ms`, `session_expires_at`).

### 2. ✅ Removed Dead Code: `verify-acceptance` Fallback in `useSolanaRooms.ts`

Removed ~50 lines of dead code from `createRoom` function. Now uses fail-open pattern:
```typescript
if (rpcError) {
  console.warn("[CreateRoom] record_acceptance failed (non-blocking):", rpcError.message);
} else {
  console.log("[CreateRoom] ✅ Recorded acceptance with tx signature and mode:", mode);
}
```

### 3. ✅ Deleted Unused Hooks

- `src/hooks/useRankedAcceptance.ts` - DELETED (called deprecated `ranked-accept`)
- `src/hooks/useGameAcceptance.ts` - DELETED (called deprecated `verify-acceptance`)

### 4. ✅ Kept `src/lib/gameAcceptance.ts`

Still used by `useSolanaRooms.ts` for:
- `computeRulesHash()` - computes SHA-256 hash of rules
- `createRulesFromRoom()` - creates rules object from room parameters

---

## Expected Result

**Database after joiner accepts:**
```sql
SELECT COUNT(*) FROM game_acceptances WHERE room_pda = '...';
-- Expected: 2 (one per player)

SELECT p1_ready, p2_ready, status_int FROM game_sessions WHERE room_pda = '...';
-- Expected: TRUE, TRUE, 2
```

**Frontend behavior:**
- `useRankedReadyGate` receives `acceptedWallets` with 2 entries
- `bothReady` becomes `true` via `fromAcceptances`
- No "Accept Rules" modal (silent auto-accept works)

---

## Architecture (Single Authority Pattern)

```text
┌────────────────────┐
│   createRoom()     │
│   joinRoom()       │
└─────────┬──────────┘
          │
          ▼
┌────────────────────────────────────┐
│  record_acceptance RPC             │
│  ─────────────────────────────────│
│  1. UPDATE game_sessions           │
│     (p1_ready/p2_ready = TRUE)     │
│  2. INSERT INTO game_acceptances   │
│  3. UPSERT player_sessions         │
└────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────┐
│  game-session-get Edge Function    │
│  Reads from game_acceptances       │
└────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────┐
│  useRankedReadyGate Hook           │
│  bothReady = fromAcceptances ✓     │
└────────────────────────────────────┘
```
