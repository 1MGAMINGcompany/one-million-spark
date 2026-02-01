import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Connection, PublicKey } from "npm:@solana/web3.js@1.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Parse room account from on-chain data
// ─────────────────────────────────────────────────────────────
interface ParsedRoom {
  roomId: bigint;
  creator: PublicKey;
  gameType: number;
  maxPlayers: number;
  playerCount: number;
  status: number;
  stakeLamports: bigint;
  winner: PublicKey;
  players: PublicKey[];
}

function parseRoomAccount(data: Uint8Array): ParsedRoom | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    let offset = 8; // Skip discriminator

    const roomId = view.getBigUint64(offset, true);
    offset += 8;

    const creator = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const gameType = data[offset];
    offset += 1;

    const maxPlayers = data[offset];
    offset += 1;

    const playerCount = data[offset];
    offset += 1;

    const status = data[offset];
    offset += 1;

    const stakeLamports = view.getBigUint64(offset, true);
    offset += 8;

    const winner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const players: PublicKey[] = [];
    for (let i = 0; i < playerCount && i < 4; i++) {
      const start = offset + i * 32;
      const end = start + 32;
      const playerKey = new PublicKey(data.slice(start, end));
      if (!playerKey.equals(PublicKey.default)) players.push(playerKey);
    }

    return {
      roomId,
      creator,
      gameType,
      maxPlayers,
      playerCount,
      status,
      stakeLamports,
      winner,
      players,
    };
  } catch (e) {
    console.error("[submit-move] Failed to parse room account:", e);
    return null;
  }
}

/**
 * Thin wrapper around submit_game_move RPC
 * 
 * All validation and atomic operations happen in Postgres:
 * - Row locking (FOR UPDATE) prevents race conditions
 * - Turn ownership validation (ranked games)
 * - Server-assigned turn numbers
 * - Idempotency via client_move_id
 * - Only turn-ending moves update current_turn_wallet
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { roomPda, wallet, moveData, clientMoveId } = await req.json();

    // Basic field validation
    if (!roomPda || !wallet || !moveData) {
      console.error("[submit-move] Missing required fields");
      return new Response(
        JSON.stringify({ success: false, error: "missing_fields" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log snapshot for debugging
    console.log("[submit-move] Calling RPC:", {
      roomPda: roomPda.slice(0, 8),
      wallet: wallet.slice(0, 8),
      moveType: moveData.type,
      clientMoveId: clientMoveId?.slice(0, 8) || "null",
    });

    // Call atomic RPC - all validation + locking happens in Postgres
    const { data: result, error } = await supabase.rpc("submit_game_move", {
      p_room_pda: roomPda,
      p_wallet: wallet,
      p_move_data: moveData,
      p_client_move_id: clientMoveId || null,
    });

    if (error) {
      console.error("[submit-move] RPC error:", error);
      return new Response(
        JSON.stringify({ success: false, error: "db_error", details: error.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // FALLBACK: If not_a_participant, sync from on-chain and retry
    // ─────────────────────────────────────────────────────────────
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
              const { error: updateError } = await supabase
                .from('game_sessions')
                .update({ 
                  participants, 
                  max_players: roomData.maxPlayers,
                  updated_at: new Date().toISOString(),
                })
                .eq('room_pda', roomPda);
              
              if (updateError) {
                console.warn("[submit-move] Failed to update participants:", updateError);
              } else {
                console.log("[submit-move] ✅ Synced participants, retrying...");
                
                // Retry the RPC call
                const { data: retryResult, error: retryError } = await supabase.rpc("submit_game_move", {
                  p_room_pda: roomPda,
                  p_wallet: wallet,
                  p_move_data: moveData,
                  p_client_move_id: clientMoveId || null,
                });
                
                if (!retryError && retryResult) {
                  console.log("[submit-move] Retry RPC result:", retryResult);
                  return new Response(
                    JSON.stringify(retryResult),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }
              }
            }
          }
        } catch (syncErr) {
          console.warn("[submit-move] On-chain sync failed:", syncErr);
        }
      }
    }

    console.log("[submit-move] RPC result:", result);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[submit-move] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "internal_error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
