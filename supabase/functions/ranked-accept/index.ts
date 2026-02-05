import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Ranked Accept - Validation-only stub
 * 
 * NOTE: This Edge Function no longer writes to the database.
 * All acceptance/readiness logic is handled by the record_acceptance RPC,
 * which is the SINGLE AUTHORITY for:
 * - Creating player sessions
 * - Inserting into game_acceptances
 * - Setting p1_ready/p2_ready flags
 * - Transitioning game to status_int = 2 (ACTIVE)
 * 
 * This function exists only for backwards compatibility and validation.
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    console.log("[ranked-accept] Received request (validation-only stub):", {
      roomPda: body.roomPda?.slice(0, 8),
      playerWallet: body.playerWallet?.slice(0, 8),
      mode: body.mode,
    });

    // Validation only - check required fields
    if (!body.roomPda || !body.playerWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing roomPda or playerWallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No DB writes - record_acceptance RPC is the single authority
    // This stub exists only for backwards compatibility
    console.log("[ranked-accept] ✅ Validation passed, handled by record_acceptance RPC");

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
