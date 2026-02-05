

## Fix Plan: Turn Timeout Reliability + Game Move Audit Log

### Issues Found

After analyzing the game logs for room `Rb7nvzh5...`:

1. **Turn 4 Bug**: A `move` was recorded after a `turn_end` by the same player - race condition
2. **First timeout shows `missedCount: 2`**: localStorage had stale data from previous session
3. **Only 1 timeout recorded**: You saw 2 missed turns locally but only 1 was submitted
4. **Final forfeit triggered manually**: No second timeout was recorded for the third strike

### Root Causes

| Issue | Root Cause |
|-------|------------|
| Turn after turn_end | Client submitted move before turn_end response updated local state |
| Wrong missedCount | `localStorage` key `missedTurns:roomPda:wallet` persists across room sessions |
| Missing timeouts | Either `timeout_too_early` rejection or `timeoutFiredRef` not reset properly |
| Timer not switching | Polling detected turn change but timer state wasn't fully reset |

---

## Fix 1: Clear Missed Turns on New Game Start

**File:** `src/pages/BackgammonGame.tsx`

When the game starts (room is activated), clear any stale missed turn counts:

```typescript
// In the effect that handles game start / startRoll.isFinalized
useEffect(() => {
  if (startRoll.isFinalized && roomPda && address) {
    // Clear stale missed turns from any previous session with this room
    clearRoom(roomPda);
  }
}, [startRoll.isFinalized, roomPda, address]);
```

Import `clearRoom` from `@/lib/missedTurns`.

---

## Fix 2: Reset Timer State When Turn Changes via Polling

**File:** `src/pages/BackgammonGame.tsx`

The `useTurnTimer` hook has an effect that resets on `isMyTurn` change. But the `isMyTurn` check uses stale `currentTurnWallet`. Need to explicitly call `resetTimer()` when polling detects a turn change.

Add to the polling turn change handler (around line 841):

```typescript
setCurrentTurnWallet(dbTurnWallet);
timeoutFiredRef.current = false;

// FIX: Explicitly reset the turn timer when polling detects turn change
turnTimer.resetTimer();
```

---

## Fix 3: Add Game Move Audit Log Component

Create a debug/audit view for game moves that can be toggled in DebugHUD.

**New File:** `src/components/GameMoveAudit.tsx`

```typescript
interface GameMoveAuditProps {
  roomPda: string;
  enabled?: boolean;
}

export function GameMoveAudit({ roomPda, enabled = false }: GameMoveAuditProps) {
  const [moves, setMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMoves = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("get-moves", {
      body: { roomPda },
    });
    setMoves(data?.moves || []);
    setLoading(false);
  };

  useEffect(() => {
    if (enabled && roomPda) fetchMoves();
  }, [enabled, roomPda]);

  // Render a table with: turn_number, wallet (short), type, created_at, flags
  // Highlight anomalies: moves after turn_end by same player, etc.
}
```

Add a "View Moves" button to DebugHUD that opens this panel.

---

## Fix 4: Server-Side Guard Against Move After Turn End

**Database Migration:** Add validation in `submit_game_move` RPC

```sql
-- Reject moves from a player who just submitted turn_end
-- Check: if last move was turn_end and nextTurnWallet != p_wallet, reject

-- Get last move for this room
SELECT * INTO v_last_move
FROM game_moves
WHERE room_pda = p_room_pda
ORDER BY turn_number DESC
LIMIT 1;

-- If last move was turn_end and handed turn to someone else, reject regular moves from original player
IF v_last_move IS NOT NULL 
   AND v_last_move.move_data->>'type' = 'turn_end'
   AND v_move_type IN ('dice_roll', 'move')
   AND v_last_move.wallet = p_wallet
THEN
  RETURN jsonb_build_object('success', false, 'error', 'turn_already_ended');
END IF;
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `BackgammonGame.tsx` | Clear stale missed turns on game start |
| `BackgammonGame.tsx` | Call `turnTimer.resetTimer()` when polling detects turn change |
| `GameMoveAudit.tsx` | New component for viewing/debugging move history |
| `DebugHUD.tsx` | Add "View Moves" button to open audit panel |
| Database Migration | Server guard against move after turn_end |

---

## Technical Notes

- The `clearRoom()` function in `missedTurns.ts` already exists - just needs to be called at the right time
- The `turnTimer.resetTimer()` is exposed by the hook but wasn't being called explicitly on poll-detected turn changes
- The server-side guard is a defense-in-depth measure - the client should prevent this but the server should also reject

