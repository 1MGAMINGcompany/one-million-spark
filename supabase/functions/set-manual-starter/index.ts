import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomPda, starterWallet, callerWallet: bodyCallerWallet } = await req.json();
    
    if (!roomPda || !starterWallet || !bodyCallerWallet) {
      return new Response(
        JSON.stringify({ error: "Missing required params: roomPda, starterWallet, callerWallet" }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Session-based identity verification ──
    let callerWallet = bodyCallerWallet;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (token.length === 64 && /^[0-9a-f]{64}$/.test(token)) {
        const { data: sessionRow } = await supabase
          .from("player_sessions")
          .select("wallet")
          .eq("session_token", token)
          .eq("room_pda", roomPda)
          .eq("revoked", false)
          .maybeSingle();

        if (sessionRow) {
          if (sessionRow.wallet !== bodyCallerWallet) {
            console.warn("[set-manual-starter] IDENTITY_MISMATCH");
            return new Response(
              JSON.stringify({ error: "IDENTITY_MISMATCH" }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          callerWallet = sessionRow.wallet;
        }
      }
    }

    console.log("[set-manual-starter] Request:", { 
      roomPda: roomPda?.slice(0, 12), 
      starterWallet: starterWallet?.slice(0, 12), 
      callerWallet: callerWallet?.slice(0, 12) 
    });

    // Fetch game session to verify caller is a participant
    const { data: session, error: fetchErr } = await supabase
      .from('game_sessions')
      .select('player1_wallet, player2_wallet, start_roll_finalized')
      .eq('room_pda', roomPda)
      .single();

    if (fetchErr || !session) {
      console.error("[set-manual-starter] Session not found:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Game session not found" }), 
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller is player1 or player2 (use trim, not toLowerCase - Base58 is case-sensitive)
    const callerTrimmed = callerWallet.trim();
    const p1Trimmed = session.player1_wallet?.trim();
    const p2Trimmed = session.player2_wallet?.trim();
    
    if (callerTrimmed !== p1Trimmed && callerTrimmed !== p2Trimmed) {
      console.warn("[set-manual-starter] Caller not a participant:", callerWallet);
      return new Response(
        JSON.stringify({ error: "Not a participant in this game" }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Already finalized? Return success without changes
    if (session.start_roll_finalized) {
      console.log("[set-manual-starter] Already finalized, skipping");
      return new Response(
        JSON.stringify({ success: true, alreadyFinalized: true }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate starter is one of the players (use trim, not toLowerCase - Base58 is case-sensitive)
    const starterTrimmed = starterWallet.trim();
    if (starterTrimmed !== p1Trimmed && starterTrimmed !== p2Trimmed) {
      console.warn("[set-manual-starter] Invalid starter wallet:", starterWallet);
      return new Response(
        JSON.stringify({ error: "Invalid starter wallet - must be a player" }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update game_sessions with manual starter
    const { error: updateErr } = await supabase
      .from('game_sessions')
      .update({
        starting_player_wallet: starterWallet,
        current_turn_wallet: starterWallet,
        start_roll_finalized: true,
        start_roll: {
          manual_pick: true,
          winner: starterWallet,
          picked_by: callerWallet,
          picked_at: Date.now()
        }
      })
      .eq('room_pda', roomPda);

    if (updateErr) {
      console.error("[set-manual-starter] Update error:", updateErr);
      throw updateErr;
    }

    console.log(`[set-manual-starter] Success - set starter for ${roomPda}: ${starterWallet}`);

    return new Response(
      JSON.stringify({ success: true }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error("[set-manual-starter] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
