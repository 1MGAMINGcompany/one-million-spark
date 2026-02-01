
# Fix Ranked Ludo 3/4 Player Support - Implementation Plan

## Summary

This plan implements full 3/4 player support for Ranked Ludo with these core changes:

1. **Database Schema**: Add `participants[]`, `winner_wallet`, `game_over_at`, `status_int` columns
2. **Derived Readiness**: Use `UNIQUE(room_pda, player_wallet)` on `game_acceptances` and derive ready count from acceptances
3. **N-Player Gate**: Require ALL participants to have accepted (no p1/p2 shortcuts)
4. **Safe Status Migration**: Add `status_int` column alongside existing `status` text column

---

## Part 1: Database Migration

### 1.1 Add UNIQUE Constraint on game_acceptances

```sql
-- Ensure each player can only accept once per room (enables accurate count)
ALTER TABLE game_acceptances 
ADD CONSTRAINT game_acceptances_room_player_unique 
UNIQUE (room_pda, player_wallet);
```

### 1.2 Add New Columns to game_sessions

```sql
-- Add participants array for N-player support (2-4 players)
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS participants text[] NOT NULL DEFAULT '{}';

-- Add winner tracking
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS winner_wallet text NULL;

-- Add game over timestamp
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS game_over_at timestamptz NULL;

-- Add NEW integer status column (keep old text status for safety)
-- 1 = waiting, 2 = active, 3 = finished
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS status_int integer NOT NULL DEFAULT 1;

-- Migrate existing text status to integer
UPDATE game_sessions SET status_int = CASE
  WHEN status = 'waiting' THEN 1
  WHEN status = 'active' THEN 2
  WHEN status = 'finished' THEN 3
  ELSE 1
END
WHERE status_int = 1;

-- Fix max_players to be NOT NULL
ALTER TABLE game_sessions 
ALTER COLUMN max_players SET NOT NULL;
ALTER TABLE game_sessions 
ALTER COLUMN max_players SET DEFAULT 2;
```

Note: The old `status` text column is preserved. It will be dropped in a future migration after confirming no RLS policies, views, or triggers depend on it.

### 1.3 Backfill Existing Data

```sql
-- Backfill participants from player1_wallet/player2_wallet
UPDATE game_sessions
SET participants = CASE 
  WHEN player2_wallet IS NOT NULL THEN ARRAY[player1_wallet, player2_wallet]
  ELSE ARRAY[player1_wallet]
END
WHERE participants = '{}' 
  AND player1_wallet IS NOT NULL;

-- Ensure max_players is set
UPDATE game_sessions SET max_players = 2 WHERE max_players IS NULL;
```

### 1.4 Add GIN Index

```sql
CREATE INDEX IF NOT EXISTS idx_game_sessions_participants_gin 
ON game_sessions USING GIN (participants);
```

---

## Part 2: Database Function Updates

### 2.1 Create Helper Function: Check All Participants Accepted

This function checks if `participants ⊆ accepted_wallets` from `game_acceptances`:

```sql
CREATE OR REPLACE FUNCTION public.all_participants_accepted(
  p_room_pda text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_participants text[];
  v_acceptance_count int;
  v_required_count int;
BEGIN
  -- Get participants array
  SELECT participants INTO v_participants
  FROM game_sessions
  WHERE room_pda = p_room_pda;
  
  IF v_participants IS NULL THEN
    RETURN false;
  END IF;
  
  v_required_count := array_length(v_participants, 1);
  IF v_required_count IS NULL OR v_required_count = 0 THEN
    RETURN false;
  END IF;
  
  -- Count acceptances that match participants
  SELECT COUNT(*) INTO v_acceptance_count
  FROM game_acceptances a
  WHERE a.room_pda = p_room_pda
    AND a.player_wallet = ANY(v_participants);
  
  RETURN v_acceptance_count >= v_required_count;
END;
$$;
```

### 2.2 Update set_player_ready - Upsert into game_acceptances

Instead of manually incrementing a counter, this function upserts into `game_acceptances` and updates legacy flags:

```sql
CREATE OR REPLACE FUNCTION public.set_player_ready(
  p_room_pda text,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_participant_idx int;
BEGIN
  -- Lock and fetch session
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game session not found';
  END IF;

  -- SECURITY: Wallet MUST already be in participants array
  v_participant_idx := array_position(v_session.participants, p_wallet);
  
  IF v_participant_idx IS NULL THEN
    -- Fallback: check legacy player1/player2 columns for 2-player games
    IF p_wallet = v_session.player1_wallet THEN
      v_participant_idx := 1;
    ELSIF p_wallet = v_session.player2_wallet THEN
      v_participant_idx := 2;
    ELSE
      RAISE EXCEPTION 'wallet not a participant';
    END IF;
  END IF;

  -- Update legacy p1/p2 ready flags (for backward compat with 2-player)
  IF v_participant_idx = 1 THEN
    UPDATE game_sessions 
    SET p1_ready = true, updated_at = now() 
    WHERE room_pda = p_room_pda AND NOT p1_ready;
  ELSIF v_participant_idx = 2 THEN
    UPDATE game_sessions 
    SET p2_ready = true, player2_wallet = p_wallet, updated_at = now() 
    WHERE room_pda = p_room_pda AND NOT p2_ready;
  END IF;
  
  -- Readiness is derived from game_acceptances (UNIQUE constraint handles deduplication)
  -- The ranked-accept edge function handles the INSERT into game_acceptances
END;
$$;
```

### 2.3 Update submit_game_move - N-Player Validation + Integer Status

Key changes:
1. Validate against `participants[]` array (not just player1/player2)
2. Use `status_int` (integer) for status machine
3. For ranked/private N-player: require `all_participants_accepted()` - NO shortcuts (no p1/p2 flags, no start_roll_finalized bypass)
4. Reject ALL moves when `status_int = 3` or `game_over_at` is set
5. Set `winner_wallet` and `game_over_at` on `game_over` move

```sql
CREATE OR REPLACE FUNCTION public.submit_game_move(
  p_room_pda TEXT,
  p_wallet TEXT,
  p_move_data JSONB,
  p_client_move_id TEXT DEFAULT NULL
) RETURNS JSONB
-- ... (full implementation in migration)
```

Critical sections to update:

**A. Finished State Check (early exit):**
```sql
IF v_session.status_int = 3 OR v_session.game_over_at IS NOT NULL THEN
  IF v_move_type IN ('auto_forfeit', 'turn_timeout', 'game_over') THEN
    RETURN jsonb_build_object('success', true, 'gameFinished', true, 'idempotent', true);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'game_finished');
  END IF;
END IF;
```

**B. N-Player Participant Validation:**
```sql
v_is_participant := (p_wallet = ANY(v_session.participants));
IF NOT v_is_participant THEN
  -- Fallback: check legacy player1/player2
  v_is_participant := (p_wallet = v_session.player1_wallet OR p_wallet = COALESCE(v_session.player2_wallet, ''));
END IF;
IF NOT v_is_participant THEN
  RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
END IF;
```

**C. Game Ready Gate (strict - no shortcuts for N-player):**
```sql
IF v_session.mode IN ('ranked', 'private') THEN
  v_all_accepted := all_participants_accepted(p_room_pda);
  IF NOT v_all_accepted THEN
    RETURN jsonb_build_object('success', false, 'error', 'game_not_ready');
  END IF;
END IF;
```

**D. Status Machine (1 → 2 on first move):**
```sql
IF v_session.status_int = 1 AND v_move_type NOT IN ('turn_timeout', 'auto_forfeit') THEN
  UPDATE game_sessions 
  SET status_int = 2, status = 'active', updated_at = now() 
  WHERE room_pda = p_room_pda;
END IF;
```

**E. Handle game_over Move (2 → 3):**
```sql
IF v_move_type = 'game_over' THEN
  v_winner_wallet := p_move_data->>'winnerWallet';
  UPDATE game_sessions
  SET status_int = 3,
      status = 'finished',
      winner_wallet = v_winner_wallet,
      game_over_at = now(),
      current_turn_wallet = NULL,
      updated_at = now()
  WHERE room_pda = p_room_pda;
  
  RETURN jsonb_build_object(
    'success', true,
    'moveHash', v_new_hash,
    'turnNumber', v_new_turn,
    'gameFinished', true,
    'winnerWallet', v_winner_wallet
  );
END IF;
```

### 2.4 Update ensure_game_session - Accept Participants

```sql
CREATE OR REPLACE FUNCTION public.ensure_game_session(
  p_room_pda text,
  p_game_type text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_mode text DEFAULT 'casual',
  p_max_players int DEFAULT 2,
  p_participants text[] DEFAULT NULL
) RETURNS void
-- ... (updates to use participants array and status_int)
```

---

## Part 3: Edge Function Updates

### 3.1 Update `ranked-accept/index.ts`

Add on-chain participant sync before marking player ready:

1. Add Solana imports (`Connection`, `PublicKey`)
2. Copy `parseRoomAccount` helper from `settle-game/index.ts` (lines 140-192)
3. Before calling `set_player_ready`, fetch on-chain room and sync `participants` + `max_players` to DB
4. Ensure INSERT into `game_acceptances` uses `ON CONFLICT` to handle the new UNIQUE constraint

```typescript
// After validation, before set_player_ready:
const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
if (rpcUrl) {
  try {
    const connection = new Connection(rpcUrl);
    const roomPubkey = new PublicKey(body.roomPda);
    const accountInfo = await connection.getAccountInfo(roomPubkey);
    
    if (accountInfo?.data) {
      const roomData = parseRoomAccount(new Uint8Array(accountInfo.data));
      if (roomData) {
        const participants = roomData.players.map(p => p.toBase58());
        
        await supabase
          .from('game_sessions')
          .update({
            participants,
            max_players: roomData.maxPlayers,
            updated_at: new Date().toISOString(),
          })
          .eq('room_pda', body.roomPda);
          
        console.log("[ranked-accept] Synced participants from on-chain:", participants.length);
      }
    }
  } catch (err) {
    console.warn("[ranked-accept] On-chain sync failed:", err);
  }
}

// Update INSERT to handle UNIQUE constraint:
.insert({...})
.on('conflict', { onConstraint: 'game_acceptances_room_player_unique' })
// Or simply catch the duplicate key error
```

### 3.2 Update `submit-move/index.ts`

Add fallback on-chain sync when `not_a_participant` error occurs:

```typescript
if (result?.error === 'not_a_participant') {
  console.log("[submit-move] Attempting on-chain participant sync...");
  const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
  
  if (rpcUrl) {
    const connection = new Connection(rpcUrl);
    const accountInfo = await connection.getAccountInfo(new PublicKey(roomPda));
    
    if (accountInfo?.data) {
      const roomData = parseRoomAccount(new Uint8Array(accountInfo.data));
      if (roomData && roomData.players.some(p => p.toBase58() === wallet)) {
        const participants = roomData.players.map(p => p.toBase58());
        
        // Sync and retry
        await supabase
          .from('game_sessions')
          .update({ participants, max_players: roomData.maxPlayers })
          .eq('room_pda', roomPda);
        
        // Retry RPC
        const { data: retryResult } = await supabase.rpc("submit_game_move", {...});
        return new Response(JSON.stringify(retryResult), {...});
      }
    }
  }
}
```

### 3.3 Update `game-session-get/index.ts`

Compute N-player bothAccepted by checking if ALL participants are in acceptances:

```typescript
// Fetch participants from session
const participants = session?.participants || [];

// Get accepted wallets (already deduplicated by Map)
const acceptedWallets = new Set(players.map(p => p.wallet));

// ALL participants must have accepted - strict check
const allParticipantsAccepted = participants.length > 0 && 
  participants.every(p => acceptedWallets.has(p));

// Return in response
const acceptances = { 
  players, 
  bothAccepted: allParticipantsAccepted,
  acceptedCount: acceptedWallets.size,
  requiredCount: participants.length,
};
```

---

## Part 4: Frontend Updates

### 4.1 Update `useRankedReadyGate.ts`

Already correctly computes N-player readiness at line 99-101:
```typescript
const bothReady = hasParticipants
  ? participantsNorm.every(w => acceptedWallets.has(w))
  : (serverBothAccepted || (sessionComplete && p1Ready && p2Ready));
```

This is correct - no changes needed for the core logic.

### 4.2 Update `LudoGame.tsx` (lines 899-907)

Ensure `game_over` move includes `type: 'game_over'` (not `action: 'game_over'`) to match the RPC handler:

```typescript
// Current (incorrect):
persistMove({
  action: "game_over",  // Wrong key!
  winnerWallet,
  winnerColor,
  reason: "elimination",
}, address || "");

// Fixed:
persistMove({
  type: "game_over",  // Correct key for RPC
  winnerWallet,
  winnerColor,
  reason: "elimination",
}, address || "");
```

### 4.3 Verify useLudoEngine.ts

The winner determination is correct (line 346-352):
```typescript
const winnerColor = checkWinner(newPlayers);
if (winnerColor) {
  setWinner(winnerColor);
  setPhase('GAME_OVER');
  // Winner is NOT added to eliminatedPlayers - correct!
}
```

No changes needed here.

---

## Files to Modify

| File | Change |
|------|--------|
| **SQL Migration** | Add UNIQUE on acceptances; add `participants`, `winner_wallet`, `game_over_at`, `status_int`; backfill; GIN index |
| **SQL: `all_participants_accepted`** | New helper function |
| **SQL: `set_player_ready`** | Validate against `participants[]`; update legacy flags only |
| **SQL: `submit_game_move`** | Use `status_int`; call `all_participants_accepted()`; no p1/p2 shortcuts |
| **SQL: `ensure_game_session`** | Accept and store participants array; use `status_int` |
| `supabase/functions/ranked-accept/index.ts` | Add on-chain participant sync; handle UNIQUE conflict |
| `supabase/functions/submit-move/index.ts` | Add fallback on-chain sync on `not_a_participant` |
| `supabase/functions/game-session-get/index.ts` | Return participants; compute N-player bothAccepted from acceptances |
| `src/pages/LudoGame.tsx` | Fix game_over move to use `type` key (not `action`) |

---

## Security Notes

1. **Participants synced server-side only** - Edge functions fetch from on-chain and write to DB
2. **No client can add themselves** - `set_player_ready` only validates against existing participants
3. **UNIQUE constraint** prevents duplicate acceptances and enables accurate count
4. **Status_int preserved alongside status** - Two-step migration for safety
5. **On-chain room is canonical** - `parseRoomAccount` used in edge functions

---

## Acceptance Criteria

1. Create Ranked Ludo 3-player room
2. All 3 wallets can accept (stored in `game_acceptances` with UNIQUE constraint)
3. Game becomes ready ONLY when ALL 3 participants have accepted (derived from acceptances)
4. `status_int` transitions: 1 → 2 → 3
5. Timeouts rotate across all 3 participants
6. After 3 missed turns, player eliminated (not winner)
7. When 1 player remains: `status_int=3`, `winner_wallet` set, `game_over_at` set
8. No further moves accepted after finished
9. Existing 2-player games continue working (legacy p1/p2 flags still function)
