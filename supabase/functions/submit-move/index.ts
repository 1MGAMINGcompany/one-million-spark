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

    const { roomPda, wallet: bodyWallet, moveData, clientMoveId } = await req.json();

    // Basic field validation
    if (!roomPda || !bodyWallet || !moveData) {
      console.error("[submit-move] Missing required fields");
      return new Response(
        JSON.stringify({ success: false, error: "missing_fields" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Session-based identity verification ──
    // If a valid session token is present, derive wallet from DB and override body wallet.
    let wallet = bodyWallet;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      // Session tokens are 64-char hex strings; skip anon/service keys
      if (token.length === 64 && /^[0-9a-f]{64}$/.test(token)) {
        const { data: sessionRow } = await supabase
          .from("player_sessions")
          .select("wallet")
          .eq("session_token", token)
          .eq("room_pda", roomPda)
          .eq("revoked", false)
          .maybeSingle();

        if (sessionRow) {
          if (sessionRow.wallet !== bodyWallet) {
            console.warn("[submit-move] IDENTITY_MISMATCH", {
              sessionWallet: sessionRow.wallet.slice(0, 8),
              bodyWallet: bodyWallet.slice(0, 8),
            });
            return new Response(
              JSON.stringify({ success: false, error: "IDENTITY_MISMATCH" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // Override with verified wallet
          wallet = sessionRow.wallet;
        }
      }
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
