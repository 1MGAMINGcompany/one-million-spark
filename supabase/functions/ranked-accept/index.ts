import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SIMPLIFIED: Validation-only stub.
 * 
 * All acceptance logic is now handled by `record_acceptance` RPC.
 * This function exists only for backward compatibility and may be removed in future.
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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

    console.log("[ranked-accept] Validation-only mode:", {
      roomPda: body.roomPda?.slice(0, 8),
      playerWallet: body.playerWallet?.slice(0, 8),
    });

    // No acceptance logic - record_acceptance RPC handles everything:
    // - Creates game_acceptances entry (idempotent)
    // - Sets p1_ready / p2_ready flags
    // - Triggers maybe_activate_game_session for status_int transition
    // - Triggers maybe_finalize_start_state for starting player

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Acceptance handled by record_acceptance RPC" 
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
