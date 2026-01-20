import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
