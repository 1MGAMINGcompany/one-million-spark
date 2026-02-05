
# Fix Plan: Restore Game Acceptance Flow

## Root Cause Analysis

The **Single Authority Pattern** stripped `ranked-accept` of its database writes, but `record_acceptance` RPC was NOT updated to insert into `game_acceptances`. This breaks the ranked ready gate:

| Component | What It Does | Problem |
|-----------|--------------|---------|
| `record_acceptance` RPC | Sets `p1_ready`/`p2_ready` flags + `player_sessions` | **Missing**: `INSERT INTO game_acceptances` |
| `ranked-accept` (old) | Inserted into `game_acceptances` + called `set_player_ready` | **Now stripped** - validation-only stub |
| `useRankedReadyGate` | Checks `acceptedWallets` from `game_acceptances` | **Fails**: No rows in `game_acceptances` |
| `game-session-get` | Has fallback `fromSessionFlags` | Works but `acceptedWallets` array is empty |

**Result**: Games can start (via `p1_ready`/`p2_ready` flags) but the UI shows empty `acceptedWallets`, breaking ranked gate polling.

---

## Changes Required

### 1. Fix `record_acceptance` RPC to Insert into `game_acceptances`

**What**: Add the missing `INSERT INTO game_acceptances` statement to the RPC.

**SQL Migration**:
```sql
CREATE OR REPLACE FUNCTION public.record_acceptance(
  p_room_pda text,
  p_wallet text,
  p_tx_signature text,
  p_rules_hash text,
  p_stake_lamports bigint,
  p_is_creator boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '4 hours';
  
  -- Update game_sessions ready flags
  IF p_is_creator THEN
    UPDATE game_sessions
    SET p1_acceptance_tx = p_tx_signature,
        p1_ready = TRUE,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    UPDATE game_sessions
    SET p2_acceptance_tx = p_tx_signature,
        p2_ready = TRUE,
        player2_wallet = p_wallet,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  END IF;
  
  -- ✅ FIX: Insert into game_acceptances table (was missing!)
  INSERT INTO game_acceptances (
    room_pda, 
    player_wallet, 
    rules_hash, 
    signature, 
    session_token
  ) VALUES (
    p_room_pda, 
    p_wallet, 
    p_rules_hash, 
    p_tx_signature, 
    v_session_token
  )
  ON CONFLICT (room_pda, player_wallet) DO UPDATE SET
    signature = EXCLUDED.signature,
    session_token = EXCLUDED.session_token,
    created_at = NOW();
  
  -- Update player_sessions for session management
  INSERT INTO player_sessions (room_pda, wallet, session_token, rules_hash, last_turn, last_hash)
  VALUES (p_room_pda, p_wallet, v_session_token, p_rules_hash, 0, NULL)
  ON CONFLICT (room_pda, wallet) 
  DO UPDATE SET 
    session_token = v_session_token,
    rules_hash = p_rules_hash,
    revoked = FALSE,
    last_move_at = NOW();
  
  RETURN jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at
  );
END;
$$;
```

---

### 2. Remove Dead Code: `verify-acceptance` Fallback in `useSolanaRooms.ts` (createRoom)

**File**: `src/hooks/useSolanaRooms.ts`

**Remove lines 496-539**: The `verify-acceptance` edge function fallback block in `createRoom`.

**Before** (lines 494-544):
```typescript
if (rpcError) {
  console.warn("[CreateRoom] RPC record_acceptance failed:", rpcError);
  // Check if 404 (function not found) - fallback to edge function
  if (rpcError.message?.includes("404") || rpcError.code === "PGRST116") {
    // ... 40 lines of dead verify-acceptance fallback code ...
  }
}
```

**After**:
```typescript
if (rpcError) {
  // FAIL-OPEN: Log error but don't block room creation
  console.warn("[CreateRoom] record_acceptance failed (non-blocking):", rpcError.message);
} else {
  console.log("[CreateRoom] ✅ Recorded acceptance with tx signature and mode:", mode);
}
```

---

### 3. Remove Unused Hooks

**Files to delete**:
- `src/hooks/useRankedAcceptance.ts` - Unused, calls deprecated `ranked-accept`
- `src/hooks/useGameAcceptance.ts` - Unused, calls deprecated `verify-acceptance`

---

## Summary of Changes

| File | Change |
|------|--------|
| **Database Migration** | Add `INSERT INTO game_acceptances` to `record_acceptance` RPC |
| `src/hooks/useSolanaRooms.ts` | Remove `verify-acceptance` fallback (~40 lines) |
| `src/hooks/useRankedAcceptance.ts` | **DELETE** (unused hook) |
| `src/hooks/useGameAcceptance.ts` | **DELETE** (unused hook) |

---

## Expected Result After Fix

**Database check after joiner accepts:**
```sql
SELECT COUNT(*) FROM game_acceptances WHERE room_pda = '...';
-- Expected: 2 (one per player, no duplicate key errors)

SELECT p1_ready, p2_ready, status_int FROM game_sessions WHERE room_pda = '...';
-- Expected: TRUE, TRUE, 2
```

**Frontend behavior:**
- `useRankedReadyGate` receives `acceptedWallets` with 2 entries
- `bothReady` becomes `true` via `fromAcceptances` (not just fallback)
- No "Accept Rules" modal shown (silent auto-accept works)

---

## Technical Details

The fix ensures **single authority** is maintained:

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
│  2. INSERT INTO game_acceptances   │  ← NEW
│  3. UPSERT player_sessions         │
└────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────┐
│  game-session-get Edge Function    │
│  ─────────────────────────────────│
│  Reads from game_acceptances       │
│  Returns acceptedWallets + flags   │
└────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────┐
│  useRankedReadyGate Hook           │
│  ─────────────────────────────────│
│  bothReady = fromAcceptances ✓     │
│           || fromSessionFlags      │
│           || fromStartRoll         │
└────────────────────────────────────┘
```
