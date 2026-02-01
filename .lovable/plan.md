
# Remaining Implementation: Edge Functions & Frontend Updates

Since the database migration (Part 1 & Part 2) has been successfully implemented, the following edge function and frontend updates remain:

---

## Status: ✅ Database Complete, ⏳ Edge Functions & Frontend Pending

---

## Part 3: Edge Function Updates

### 3.1 Update `ranked-accept/index.ts`

**Add on-chain participant sync before marking player ready:**

```typescript
// Add imports at top
import { Connection, PublicKey } from "npm:@solana/web3.js@1.95.0";

// Add parseRoomAccount helper (copy from settle-game/index.ts lines 140-192)
function parseRoomAccount(data: Uint8Array): ParsedRoom | null {
  // ... (full function from settle-game)
}

// Before calling set_player_ready (around line 200), add:
const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
if (rpcUrl) {
  try {
    console.log("[ranked-accept] Syncing participants from on-chain...");
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
          
        console.log("[ranked-accept] ✅ Synced participants:", participants.length);
      }
    }
  } catch (err) {
    console.warn("[ranked-accept] On-chain sync failed:", err);
  }
}
```

---

### 3.2 Update `submit-move/index.ts`

**Add fallback on-chain sync when `not_a_participant` error occurs:**

```typescript
// Add imports at top
import { Connection, PublicKey } from "npm:@solana/web3.js@1.95.0";

// Add parseRoomAccount helper (same as ranked-accept)

// After the main RPC call (around line 55), add retry logic:
if (result?.error === 'not_a_participant') {
  console.log("[submit-move] Attempting on-chain participant sync...");
  const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
  
  if (rpcUrl) {
    try {
      const connection = new Connection(rpcUrl);
      const roomPubkey = new PublicKey(roomPda);
      const accountInfo = await connection.getAccountInfo(roomPubkey);
      
      if (accountInfo?.data) {
        const roomData = parseRoomAccount(new Uint8Array(accountInfo.data));
        
        if (roomData && roomData.players.some(p => p.toBase58() === wallet)) {
          const participants = roomData.players.map(p => p.toBase58());
          
          // Sync participants to DB
          await supabase
            .from('game_sessions')
            .update({ participants, max_players: roomData.maxPlayers })
            .eq('room_pda', roomPda);
          
          console.log("[submit-move] ✅ Synced participants, retrying...");
          
          // Retry the RPC call
          const { data: retryResult, error: retryError } = await supabase.rpc("submit_game_move", {
            p_room_pda: roomPda,
            p_wallet: wallet,
            p_move_data: moveData,
            p_client_move_id: clientMoveId || null,
          });
          
          if (!retryError) {
            return new Response(
              JSON.stringify(retryResult),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    } catch (syncErr) {
      console.warn("[submit-move] On-chain sync failed:", syncErr);
    }
  }
}
```

---

### 3.3 Update `game-session-get/index.ts`

**Compute N-player bothAccepted by checking if ALL participants are in acceptances:**

Replace lines 96-116 with:

```typescript
// Get required players from session (default 2)
const requiredPlayers = session?.max_players ?? 2;

// Get participants array from session (for N-player)
const participants: string[] = session?.participants || [];

// Deduplicate acceptances by player_wallet
const byWallet = new Map<string, { wallet: string; accepted_at: string }>();
for (const a of rawAcceptances ?? []) {
  if (!byWallet.has(a.player_wallet)) {
    byWallet.set(a.player_wallet, { wallet: a.player_wallet, accepted_at: a.created_at });
  }
}
const players = Array.from(byWallet.values()).map(p => ({ ...p, accepted: true }));

// Create set of accepted wallets for membership check
const acceptedWallets = new Set(players.map(p => p.wallet));

// N-PLAYER FIX: ALL participants must have accepted (participants ⊆ accepted_wallets)
// No p1/p2 shortcuts, no start_roll_finalized bypass
const allParticipantsAccepted = participants.length > 0 && 
  participants.every(p => acceptedWallets.has(p));

// Fallback for 2-player (backward compat)
const fromAcceptances = players.length >= requiredPlayers;
const fromSessionFlags = Boolean(session?.p1_ready && session?.p2_ready);

// bothAccepted: prefer strict participant check, fallback to legacy
const bothAccepted = participants.length > 0 
  ? allParticipantsAccepted 
  : (fromAcceptances || fromSessionFlags);

console.log("[game-session-get] Acceptances:", {
  playersCount: players.length,
  requiredPlayers,
  participantsCount: participants.length,
  allParticipantsAccepted,
  fromAcceptances,
  fromSessionFlags,
  bothAccepted,
});

const acceptances = { 
  players, 
  bothAccepted,
  acceptedCount: acceptedWallets.size,
  requiredCount: participants.length || requiredPlayers,
};
```

---

## Part 4: Frontend Update

### 4.1 Fix `LudoGame.tsx` (lines 900-907)

**Change `action: "game_over"` to `type: "game_over"` to match the RPC handler:**

Current (incorrect):
```typescript
persistMove({
  action: "game_over",  // Wrong key!
  winnerWallet,
  winnerColor,
  reason: "elimination",
}, address || "");
```

Fixed:
```typescript
persistMove({
  type: "game_over",  // Correct key for RPC
  winnerWallet,
  winnerColor,
  reason: "elimination",
}, address || "");
```

---

## Files to Modify

| File | Status | Change |
|------|--------|--------|
| `supabase/functions/ranked-accept/index.ts` | ⏳ Pending | Add Solana imports + parseRoomAccount + on-chain sync |
| `supabase/functions/submit-move/index.ts` | ⏳ Pending | Add fallback on-chain sync on `not_a_participant` |
| `supabase/functions/game-session-get/index.ts` | ⏳ Pending | Compute N-player bothAccepted from participants |
| `src/pages/LudoGame.tsx` | ⏳ Pending | Fix `action` → `type` for game_over move |

---

## Implementation Order

1. **ranked-accept/index.ts** - Add on-chain participant sync (ensures participants[] is populated before set_player_ready)
2. **game-session-get/index.ts** - Update bothAccepted logic (enables frontend to correctly detect N-player readiness)
3. **submit-move/index.ts** - Add fallback sync (handles edge case where ranked-accept sync failed)
4. **LudoGame.tsx** - Fix game_over move key (ensures game end is properly recorded with status_int = 3)

---

## Testing Checklist

After implementation:
- [ ] Create 3-player Ranked Ludo room
- [ ] All 3 wallets accept rules successfully
- [ ] `game-session-get` returns `bothAccepted: true` only after all 3 accept
- [ ] Moves are rejected until all 3 players accepted
- [ ] Game ends correctly with `winner_wallet` and `game_over_at` set
- [ ] No further moves accepted after game finishes
