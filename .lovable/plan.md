

# Single Authority Plan: Eliminate Double Acceptance

## Summary
This plan eliminates the race condition between `ranked-accept` (Edge Function) and `record_acceptance` (RPC) by making `record_acceptance` the single authority for all acceptance/readiness logic.

## Current Problem
- **4 places** call `ranked-accept` Edge Function:
  1. `src/hooks/useSolanaRooms.ts` (lines 547-561) - in createRoom after record_acceptance
  2. `src/hooks/useRankedReadyGate.ts` (line 156) - in acceptRules callback
  3. `src/hooks/useRankedAcceptance.ts` (line 122) - unused hook, can be deleted
  4. `src/pages/CreateRoom.tsx` - just a comment

- **`ranked-accept`** currently does:
  - Lines 152-169: Insert into `game_acceptances` (signed mode)
  - Lines 180-199: Insert into `game_acceptances` (simple mode)
  - Lines 202-215: Call `set_player_ready` RPC

This causes duplicate key errors and race conditions.

---

## Changes Required

### 1. Simplify `ranked-accept` Edge Function
**File:** `supabase/functions/ranked-accept/index.ts`

Strip ALL database writes. Keep only:
- CORS handling
- Input validation
- Return `{ success: true }`

**Remove:**
- Lines 82-84: `sessionToken`, `signatureForRecord` variables
- Lines 86-169: Entire signed mode block with DB writes
- Lines 171-199: Entire simple mode block with DB writes
- Lines 202-215: `set_player_ready` call

**New implementation (~40 lines total):**
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Validation only
    if (!body.roomPda || !body.playerWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing roomPda or playerWallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[ranked-accept] Validation-only stub:", body.roomPda.slice(0, 8));

    // No DB writes - record_acceptance RPC is the single authority
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Handled by record_acceptance RPC" 
      }),
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

---

### 2. Remove `ranked-accept` call from `useSolanaRooms.ts`
**File:** `src/hooks/useSolanaRooms.ts`

**Remove lines 543-562** (the entire "PART A FIX" block):
```typescript
// REMOVE THIS ENTIRE BLOCK:
// PART A FIX: For ranked games, ALSO insert into game_acceptances table
// record_acceptance only sets p1_ready flag, but rankedGate needs game_acceptances rows
if (mode === 'ranked') {
  try {
    const { error: rankedAcceptError } = await supabase.functions.invoke("ranked-accept", {
      body: {
        roomPda: roomPdaStr,
        playerWallet: publicKey.toBase58(),
      },
    });
    
    if (rankedAcceptError) {
      console.warn("[CreateRoom] ranked-accept for creator failed:", rankedAcceptError);
    } else {
      console.log("[CreateRoom] ✅ Creator acceptance recorded in game_acceptances for ranked game");
    }
  } catch (rankedErr) {
    console.warn("[CreateRoom] ranked-accept call failed:", rankedErr);
  }
}
```

The `record_acceptance` RPC (already called on line 485) handles everything including `game_acceptances` insertion.

---

### 3. Remove `ranked-accept` from `useRankedReadyGate.ts`
**File:** `src/hooks/useRankedReadyGate.ts`

**Replace `acceptRules` callback (lines 144-188)** with a no-op:
```typescript
const acceptRules = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
  // No-op: record_acceptance is called during join/create flow
  // Acceptance is already recorded, just trigger refetch for UI sync
  console.log("[RankedReadyGate] acceptRules no-op (handled by record_acceptance)");
  
  // Optimistic update
  if (myWalletNorm) {
    setAcceptedWallets(prev => new Set([...prev, myWalletNorm]));
  }
  
  // Refetch to sync state
  await refetch();
  
  return { success: true };
}, [myWalletNorm, refetch]);
```

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/ranked-accept/index.ts` | Remove ALL DB writes (~200 lines → ~40 lines) |
| `src/hooks/useSolanaRooms.ts` | Remove lines 543-562 (ranked-accept call) |
| `src/hooks/useRankedReadyGate.ts` | Replace acceptRules with no-op (~15 lines) |

---

## What Remains After Patch

**`ranked-accept` Edge Function:**
- CORS handling only
- Input validation only
- Returns `{ success: true }` immediately
- NO database writes

**Frontend `ranked-accept` usages:**
- `useSolanaRooms.ts`: **REMOVED** ✓
- `useRankedReadyGate.ts`: **REMOVED** ✓
- `useRankedAcceptance.ts`: Unused hook (can delete in future cleanup)
- `CreateRoom.tsx`: Just a comment, not a call

**Single authority flow:**
1. Creator: `ensure_game_session` → `record_acceptance` → Done
2. Joiner: `record_acceptance` → `maybe_activate_game_session` trigger → Done

---

## Verification After Patch

```bash
# Search should find NO frontend invocations
grep -r "invoke.*ranked-accept" src/hooks/useSolanaRooms.ts
# Expected: no matches (removed)

grep -r "invoke.*ranked-accept" src/hooks/useRankedReadyGate.ts  
# Expected: no matches (removed)
```

**Database check after joiner accepts:**
```sql
SELECT p1_ready, p2_ready, status_int, starting_player_wallet 
FROM game_sessions WHERE room_pda = '...';
-- Expected: TRUE, TRUE, 2, <creator_wallet>

SELECT COUNT(*) FROM game_acceptances WHERE room_pda = '...';
-- Expected: 2 (no duplicate key errors)
```

