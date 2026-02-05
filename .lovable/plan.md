

## Revised Plan: Complete Timeout + Forfeit Fix (All Device Combinations)

### Overview
The original plan identified the core issues but missed one additional bug. This revised plan ensures all device combinations work correctly.

---

### Issue Summary

| Bug | Impact | All Devices? |
|-----|--------|--------------|
| `moves?.[0]` at line 773 | Wrong move for outcome detection | ✅ Yes |
| `moves?.[0]` at line 821 | Wrong move for timeout toast | ✅ Yes (FIXED) |
| `finish_game_session` doesn't set winner | NULL winner in game_sessions | ✅ Yes |
| Timer not resetting on turn change | Same player's timer keeps running | ✅ Yes |

---

### Fix 1: Line 773 - Get Last Move Correctly for Outcome Detection

**File:** `src/pages/BackgammonGame.tsx`  
**Location:** Lines 770-773 (inside polling, "detect finished game" branch)

**Current code:**
```tsx
const { data: movesData } = await supabase.functions.invoke("get-moves", {
  body: { roomPda, limit: 1, orderDesc: true },
});
const lastMove = movesData?.moves?.[0];
```

**Replace with:**
```tsx
const { data: movesData } = await supabase.functions.invoke("get-moves", {
  body: { roomPda },
});
const lastMove = movesData?.moves?.at(-1);
```

---

### Fix 2: Update `finish_game_session` RPC to Accept Winner Wallet

**Database Migration:**

```sql
-- Update finish_game_session to accept and set winner_wallet
CREATE OR REPLACE FUNCTION public.finish_game_session(
  p_room_pda TEXT,
  p_caller_wallet TEXT DEFAULT NULL,
  p_winner_wallet TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_record RECORD;
BEGIN
  -- Validate room_pda
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;

  -- Get existing session
  SELECT * INTO v_existing_record 
  FROM game_sessions 
  WHERE room_pda = p_room_pda;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game session not found';
  END IF;
  
  -- Verify caller is a participant (if provided)
  IF p_caller_wallet IS NOT NULL THEN
    IF p_caller_wallet != v_existing_record.player1_wallet 
       AND p_caller_wallet != v_existing_record.player2_wallet THEN
      RAISE EXCEPTION 'Caller is not a participant in this game';
    END IF;
  END IF;
  
  -- Mark as finished with winner (BOTH status columns + game_over_at + winner)
  UPDATE game_sessions
  SET status = 'finished',
      status_int = 3,
      game_over_at = COALESCE(game_over_at, now()),
      winner_wallet = COALESCE(p_winner_wallet, winner_wallet),
      updated_at = now()
  WHERE room_pda = p_room_pda;
END;
$$;
```

---

### Fix 3: Update `forfeit-game` Edge Function to Pass Winner

**File:** `supabase/functions/forfeit-game/index.ts`  
**Location:** Around line 964-967

**Current code:**
```typescript
const { error: finishErr } = await supabase.rpc("finish_game_session", {
  p_room_pda: roomPda,
  p_caller_wallet: forfeitingWallet,
});
```

**Replace with:**
```typescript
const { error: finishErr } = await supabase.rpc("finish_game_session", {
  p_room_pda: roomPda,
  p_caller_wallet: forfeitingWallet,
  p_winner_wallet: winnerWallet,  // ← ADD THIS
});
```

---

### Fix 4: Reset `timeoutFiredRef` When Turn Changes via Polling

**File:** `src/pages/BackgammonGame.tsx`  
**Location:** Around line 841 (after `setCurrentTurnWallet(dbTurnWallet)`)

**Add after the `setCurrentTurnWallet` call:**
```tsx
setCurrentTurnWallet(dbTurnWallet);
// Reset timeout debounce since turn actually changed
timeoutFiredRef.current = false;
```

This is partially covered but should be explicit in the turn-change branch, not just the `turnStartedAt` change branch.

---

### Summary of All Changes

| File | Line | Change |
|------|------|--------|
| `BackgammonGame.tsx` | 771-773 | `moves?.[0]` → `moves?.at(-1)` |
| `BackgammonGame.tsx` | 841 | Add `timeoutFiredRef.current = false` |
| Database Migration | N/A | Update `finish_game_session` to accept `p_winner_wallet` |
| `forfeit-game/index.ts` | 964-967 | Pass `p_winner_wallet: winnerWallet` to RPC |

---

### Device Combination Coverage

After these fixes:

| Scenario | Turn Sync | Timeout Toast | Winner Recorded | Timer Reset |
|----------|-----------|---------------|-----------------|-------------|
| Desktop → Mobile | ✅ 5s poll | ✅ `.at(-1)` | ✅ via RPC | ✅ ref reset |
| Mobile → Desktop | ✅ 5s poll | ✅ `.at(-1)` | ✅ via RPC | ✅ ref reset |
| Desktop → Desktop | ✅ 5s poll | ✅ `.at(-1)` | ✅ via RPC | ✅ ref reset |
| Mobile → Mobile | ✅ 1.5s poll | ✅ `.at(-1)` | ✅ via RPC | ✅ ref reset |

Mobile wallet browsers get FASTER polling (1500ms) via `usePollingFallback`, not slower.

---

### Technical Notes

- The `usePollingFallback` hook (used in mobile wallet browsers) already uses `moves[moves.length - 1]` correctly for incremental sync
- Realtime subscriptions work on desktop but often drop on mobile wallet browsers - polling is the reliable fallback
- The `matches` table already records winners correctly - only `game_sessions` has the NULL bug

