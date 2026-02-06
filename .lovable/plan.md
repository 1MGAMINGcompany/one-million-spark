
# Fix PGRST203 — Remove finish_game_session Overload Ambiguity

## Problem
PostgREST returns PGRST203 "Could not choose best candidate function" because there are **two overloads** of `finish_game_session`:
1. `finish_game_session(p_room_pda text, p_caller_wallet text)`
2. `finish_game_session(p_room_pda text, p_caller_wallet text, p_winner_wallet text)`

When callers pass only 2 params, PostgREST can't decide which function to use.

## Solution
1. **Drop the 2-parameter overload** via SQL migration
2. **Update all callers** to pass 3 params (adding `p_winner_wallet: null` where missing)

---

## Changes Required

### 1. SQL Migration (Drop 2-param Overload)

```sql
-- Drop the 2-parameter overload to eliminate PGRST203 ambiguity
-- Keep only the 3-parameter version
DROP FUNCTION IF EXISTS public.finish_game_session(text, text);
```

After this, only the 3-param version remains:
```
finish_game_session(p_room_pda text, p_caller_wallet text, p_winner_wallet text)
```

---

### 2. Frontend: `src/lib/finalizeGame.ts` (lines 104-107)

**Before:**
```typescript
const { error: rpcError } = await supabase.rpc('finish_game_session', {
  p_room_pda: roomPda,
  p_caller_wallet: winnerWallet,
});
```

**After:**
```typescript
const { error: rpcError } = await supabase.rpc('finish_game_session', {
  p_room_pda: roomPda,
  p_caller_wallet: winnerWallet,
  p_winner_wallet: winnerWallet, // Use winnerWallet since this is called after settlement
});
```

---

### 3. Frontend: `src/hooks/useGameSessionPersistence.ts` (lines 137-140)

**Before:**
```typescript
const { error } = await supabase.rpc('finish_game_session', {
  p_room_pda: roomPda,
  p_caller_wallet: callerWallet || null,
});
```

**After:**
```typescript
const { error } = await supabase.rpc('finish_game_session', {
  p_room_pda: roomPda,
  p_caller_wallet: callerWallet || null,
  p_winner_wallet: null, // Winner unknown at this call site
});
```

---

### 4. Edge Function: `supabase/functions/settle-game/index.ts` (lines 981-984)

**Before:**
```typescript
const { error: finishErr } = await supabase.rpc("finish_game_session", {
  p_room_pda: roomPda,
  p_caller_wallet: winnerWallet,
});
```

**After:**
```typescript
const { error: finishErr } = await supabase.rpc("finish_game_session", {
  p_room_pda: roomPda,
  p_caller_wallet: winnerWallet,
  p_winner_wallet: winnerWallet, // Pass winner for DB sync
});
```

---

### 5. Edge Function: `supabase/functions/forfeit-game/index.ts` (lines 964-968)

**Status:** ✅ Already correct — passes all 3 params including `p_winner_wallet: winnerWallet`

No changes needed.

---

## Files Changed Summary

| File | Change |
|------|--------|
| Migration | Drop 2-param overload |
| `src/lib/finalizeGame.ts` | Add `p_winner_wallet: winnerWallet` |
| `src/hooks/useGameSessionPersistence.ts` | Add `p_winner_wallet: null` |
| `supabase/functions/settle-game/index.ts` | Add `p_winner_wallet: winnerWallet` |

---

## Technical Details

The 3-param function signature remains:
```sql
finish_game_session(
  p_room_pda text,
  p_caller_wallet text DEFAULT NULL,
  p_winner_wallet text DEFAULT NULL
)
```

All parameters have defaults, so passing `null` explicitly is valid and unambiguous.

---

## After This Fix

- **Exactly ONE** `finish_game_session` function in database
- **PGRST203 errors eliminated**
- Winner wallet now properly synced to database per architecture memory
