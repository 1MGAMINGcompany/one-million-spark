

# Dead Room Auto-Resolution (Safe Version)

## Overview

Implement server-side auto-cancellation for rooms stuck in WAITING state (status_int = 1) with only 1 participant for > 120 seconds. The DB marks the room as CANCELLED (status_int = 5), and the creator can claim their refund by signing a single transaction.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    WAITING TIMEOUT FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Creator accepts (record_acceptance, is_creator=true)               │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────┐                │
│  │ waiting_started_at = COALESCE(existing, now()) │                │
│  │ status_int = 1 (WAITING)                        │                │
│  └────────────────────┬────────────────────────────┘                │
│                       │                                              │
│         ┌─────────────┴─────────────┐                               │
│         │                           │                                │
│         ▼                           ▼                                │
│  ┌────────────────┐        ┌─────────────────────────┐             │
│  │ Joiner accepts │        │ No joiner after 120s    │             │
│  │ is_creator=false│        │ (polling via game-      │             │
│  │                │        │  session-get)           │             │
│  └───────┬────────┘        └────────────┬────────────┘             │
│          │                              │                           │
│          ▼                              ▼                           │
│  ┌────────────────┐        ┌─────────────────────────┐             │
│  │ Clear waiting_ │        │ maybe_apply_waiting_    │             │
│  │ started_at=NULL│        │ timeout(room_pda)       │             │
│  │ Game starts!   │        │ → status_int = 5        │             │
│  └────────────────┘        │ → status = 'cancelled'  │             │
│                            │ → game_over_at = now()  │             │
│                            └────────────┬────────────┘             │
│                                         │                           │
│                                         ▼                           │
│                            ┌─────────────────────────┐             │
│                            │ Room.tsx shows:         │             │
│                            │ "Opponent didn't show." │             │
│                            │ [Claim Refund] button   │             │
│                            └────────────┬────────────┘             │
│                                         │                           │
│                                         ▼                           │
│                            ┌─────────────────────────┐             │
│                            │ RecoverFundsButton      │             │
│                            │ → recover-funds edge fn │             │
│                            │ → creator signs cancel  │             │
│                            │ → funds returned        │             │
│                            └─────────────────────────┘             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Database Migration

Add `waiting_started_at` column to `game_sessions`:

```sql
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS waiting_started_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN game_sessions.waiting_started_at IS
  'Timestamp when room entered WAITING with only 1 participant. Cleared when opponent joins.';
```

### 2. Update `record_acceptance` RPC

Modify the existing RPC to set/clear `waiting_started_at`:

**When creator accepts (p_is_creator = true):**
- Set `waiting_started_at = COALESCE(waiting_started_at, NOW())`
- This marks "creator is now waiting for opponent"

**When joiner accepts (p_is_creator = false):**
- Clear `waiting_started_at = NULL`
- Opponent arrived, no longer in waiting timeout territory

From the useful-context, the current `record_acceptance` function structure:
```sql
-- Line to add for creator:
UPDATE game_sessions
SET p1_acceptance_tx = p_tx_signature,
    p1_ready = TRUE,
    waiting_started_at = COALESCE(waiting_started_at, NOW()),  -- ADD THIS
    updated_at = NOW()
WHERE room_pda = p_room_pda;

-- Line to add for joiner:
UPDATE game_sessions  
SET p2_acceptance_tx = p_tx_signature,
    p2_ready = TRUE,
    player2_wallet = p_wallet,
    participants = ARRAY[player1_wallet, p_wallet],
    waiting_started_at = NULL,  -- ADD THIS (clear timeout)
    updated_at = NOW()
WHERE room_pda = p_room_pda
```

### 3. New RPC: `maybe_apply_waiting_timeout`

```sql
CREATE OR REPLACE FUNCTION public.maybe_apply_waiting_timeout(p_room_pda TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_session RECORD;
  v_deadline TIMESTAMPTZ;
  v_participant_count INTEGER;
  v_waiting_timeout_seconds INTEGER := 120;
BEGIN
  -- Lock session for atomic update
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'session_not_found');
  END IF;

  -- Only apply to WAITING status (status_int = 1)
  IF v_session.status_int != 1 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_waiting');
  END IF;

  -- Count real participants (exclude placeholders)
  SELECT COUNT(*) INTO v_participant_count
  FROM unnest(COALESCE(v_session.participants, ARRAY[]::TEXT[])) AS p
  WHERE p IS NOT NULL 
    AND p != '' 
    AND p != '11111111111111111111111111111111';

  -- Only apply if exactly 1 participant (opponent never joined)
  IF v_participant_count >= 2 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'has_opponent');
  END IF;

  -- Backfill waiting_started_at if null (use created_at)
  IF v_session.waiting_started_at IS NULL THEN
    v_session.waiting_started_at := v_session.created_at;
  END IF;

  -- Calculate deadline
  v_deadline := v_session.waiting_started_at + 
                (v_waiting_timeout_seconds || ' seconds')::INTERVAL;

  IF NOW() < v_deadline THEN
    RETURN jsonb_build_object(
      'applied', false, 
      'reason', 'not_expired',
      'remaining_seconds', EXTRACT(EPOCH FROM (v_deadline - NOW()))::INTEGER
    );
  END IF;

  -- === TIMEOUT EXPIRED ===
  -- Mark session as CANCELLED (DB only - no on-chain action)
  UPDATE game_sessions
  SET status = 'cancelled',
      status_int = 5,
      game_over_at = NOW(),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true,
    'action', 'cancelled',
    'creatorWallet', v_session.player1_wallet,
    'reason', 'opponent_no_show'
  );
END;
$$;
```

### 4. Update `game-session-get` Edge Function

After fetching the session, if `status_int === 1` (WAITING), call the timeout RPC:

```typescript
// After line 50 (after fetching session)

// Check for waiting timeout (only for WAITING rooms)
if (session?.status_int === 1) {
  try {
    const { data: timeoutResult, error: timeoutError } = await supabase
      .rpc('maybe_apply_waiting_timeout', { p_room_pda: roomPda });

    if (timeoutError) {
      console.warn('[game-session-get] Waiting timeout check error:', timeoutError);
    } else if (timeoutResult?.applied) {
      console.log('[game-session-get] Waiting timeout applied:', timeoutResult);
      
      // Re-fetch session after cancellation
      const { data: updatedSession } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_pda', roomPda)
        .maybeSingle();

      if (updatedSession) {
        session = updatedSession;
      }
    }
  } catch (e) {
    console.warn('[game-session-get] Waiting timeout exception:', e);
  }
}
```

### 5. Update `Room.tsx` UI

Add state to track DB session's `status_int` and display cancelled room UI:

**State additions:**
```typescript
const [dbStatusInt, setDbStatusInt] = useState<number | null>(null);
```

**In the existing fetchRoomMode useEffect, also capture status_int:**
```typescript
if (session?.mode) {
  setRoomMode(session.mode as 'casual' | 'ranked');
  setDbStatusInt(session.status_int ?? null);  // ADD THIS
  // ... rest of existing code
}
```

**New UI block (add before "Action Buttons" section, around line 1090):**
```tsx
{/* Cancelled Room - Waiting Timeout */}
{dbStatusInt === 5 && isCreator && (
  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
    <div className="flex items-center gap-2 text-amber-400">
      <AlertTriangle className="h-5 w-5" />
      <span className="font-medium">Opponent didn't show</span>
    </div>
    <p className="text-sm text-muted-foreground">
      The room was automatically cancelled after 2 minutes of waiting. 
      Click below to reclaim your stake.
    </p>
    <RecoverFundsButton 
      roomPda={roomPdaParam || ""} 
      onRecovered={() => navigate('/room-list')}
    />
  </div>
)}
```

## Files to Change

| File | Change |
|------|--------|
| **New migration** | Add `waiting_started_at` column + create `maybe_apply_waiting_timeout` RPC + update `record_acceptance` RPC |
| `supabase/functions/game-session-get/index.ts` | Call `maybe_apply_waiting_timeout` for WAITING rooms |
| `src/pages/Room.tsx` | Add `dbStatusInt` state, show cancelled room UI with refund button |

## Security & Safety

- **No verifier signing**: Creator must sign their own cancel transaction
- **No new auth**: Uses existing `recover-funds` flow
- **Idempotent**: Multiple calls to `maybe_apply_waiting_timeout` are safe
- **Atomic**: Uses `FOR UPDATE` lock to prevent race conditions
- **DB-only**: Does NOT attempt on-chain cancel - that's user-signed

## Edge Cases

1. **Backfill**: If `waiting_started_at` is NULL (old rooms), uses `created_at` as fallback
2. **Already cancelled**: RPC returns early with `'reason': 'not_waiting'`
3. **Opponent joins during timeout**: `record_acceptance` clears `waiting_started_at`, so timeout check returns `'has_opponent'`
4. **On-chain still open**: Expected - the on-chain room remains open until creator signs cancel tx

## Status Integer Reference

| status_int | status | Meaning |
|------------|--------|---------|
| 1 | waiting | Room created, waiting for players |
| 2 | active | Game in progress |
| 3 | finished | Game completed normally |
| 4 | void | Settlement failed |
| 5 | cancelled | Room cancelled (pre-active) |

