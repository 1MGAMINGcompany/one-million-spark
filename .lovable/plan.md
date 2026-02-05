
# Plan: Eliminate Double Acceptance Race Condition

## Problem Summary
The codebase has **two competing acceptance paths** that cause race conditions:

| Path | Location | What It Does |
|------|----------|--------------|
| `record_acceptance` | PostgreSQL RPC | Creates session, inserts game_acceptances, sets p1_ready/p2_ready, activates game |
| `ranked-accept` | Edge Function | **Also** inserts into game_acceptances and calls set_player_ready |

This causes:
- **Duplicate key errors** (SQLSTATE 23505) on `game_acceptances`
- **Race condition** where edge function tries to call `set_player_ready` before session exists
- **Stuck "Waiting for opponent"** because `p2_ready` never gets set after the error

## Solution: Single Authority Pattern
Make `record_acceptance` the **single authority** for all acceptance logic.

---

## Changes Required

### 1. Simplify `ranked-accept` Edge Function (Critical)
**File:** `supabase/functions/ranked-accept/index.ts`

Remove ALL acceptance/readiness logic. The function should ONLY:
- Validate inputs
- Return `{ success: true }`

Remove:
- Lines 152-169: Insert into `game_acceptances` (signed mode)
- Lines 180-199: Insert into `game_acceptances` (simple mode)
- Lines 202-215: Call `set_player_ready` RPC

The simplified function becomes a no-op authentication stub that can be removed in future.

### 2. Remove Dual Calls from Frontend - Creator Flow
**File:** `src/hooks/useSolanaRooms.ts`

In `createRoom` (~lines 543-562), remove the redundant `ranked-accept` call after `record_acceptance` succeeds:
```typescript
// REMOVE THIS BLOCK:
if (mode === 'ranked') {
  try {
    const { error: rankedAcceptError } = await supabase.functions.invoke("ranked-accept", ...);
    ...
  }
}
```

`record_acceptance` already handles everything including `game_acceptances` insert.

### 3. Remove `ranked-accept` from `useRankedReadyGate`
**File:** `src/hooks/useRankedReadyGate.ts`

The `acceptRules` callback (~lines 144-188) calls `ranked-accept`. Since readiness is now auto-recorded, this function should either:
- Option A: Remove completely (preferred - no manual accept needed)
- Option B: Make it a no-op that returns success immediately

Given the "silent auto-accept" feature from memory, Option A is correct.

### 4. Verify `record_acceptance` Handles All Cases
The current PostgreSQL function already:
- Creates `player_sessions` entry (idempotent)
- Inserts into `game_acceptances` (idempotent via ON CONFLICT)
- Sets `p1_ready` / `p2_ready`
- Sets `player2_wallet` for joiners
- Calls `maybe_activate_game_session` to transition `status_int`

No changes needed to the RPC function itself.

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/ranked-accept/index.ts` | Remove game_acceptances insert + set_player_ready calls |
| `src/hooks/useSolanaRooms.ts` | Remove `ranked-accept` call from createRoom (~line 547) |
| `src/hooks/useRankedReadyGate.ts` | Remove `ranked-accept` call from acceptRules callback |

---

## Technical Details

### Simplified `ranked-accept` Edge Function
```typescript
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Basic validation only
    if (!body.roomPda || !body.playerWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing roomPda or playerWallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[ranked-accept] Validation-only mode:", body.roomPda.slice(0, 8));

    // No acceptance logic - record_acceptance handles everything
    return new Response(
      JSON.stringify({ success: true, message: "Acceptance handled by record_acceptance RPC" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[ranked-accept] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Flow After Fix

**Creator Flow:**
1. `createRoom` transaction confirms
2. `ensure_game_session` RPC creates session with mode
3. `record_acceptance` RPC → sets p1_ready, inserts game_acceptances
4. Done - no ranked-accept call

**Joiner Flow:**
1. `joinRoom` transaction confirms  
2. `record_acceptance` RPC → sets player2_wallet, p2_ready, inserts game_acceptances
3. `maybe_activate_game_session` triggers → transitions status_int 1→2
4. `maybe_finalize_start_state` triggers → sets creator as starter
5. Done - no ranked-accept call

---

## Success Criteria

After joiner acceptance:
- `p1_ready = TRUE`
- `p2_ready = TRUE`
- `status_int = 2` (ACTIVE)
- `game_acceptances` has 2 rows (no duplicate key errors)
- No "Waiting for opponent" deadlock
- Turn time displays correctly in Room List

---

## Verification Steps

1. Create a ranked room as Device A (creator)
2. Join the room as Device B (joiner)
3. Verify:
   - Game starts immediately without "Accept Rules" modal
   - No dice roll appears
   - Creator goes first
   - Database shows correct state:
     ```sql
     SELECT p1_ready, p2_ready, status_int, starting_player_wallet 
     FROM game_sessions WHERE room_pda = '...';
     -- Expected: TRUE, TRUE, 2, <creator_wallet>
     
     SELECT COUNT(*) FROM game_acceptances WHERE room_pda = '...';
     -- Expected: 2
     ```
