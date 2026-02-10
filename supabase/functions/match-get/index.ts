import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomPda } = await req.json();

    if (!roomPda) {
      return new Response(
        JSON.stringify({ error: "Missing roomPda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try match_share_cards first
    const { data: matchCard, error: cardError } = await supabase
      .from("match_share_cards")
      .select("*")
      .eq("room_pda", roomPda)
      .maybeSingle();

    let matchData = matchCard;

    // Fallback to game_sessions if no share card exists
    if (!matchData) {
      const { data: session } = await supabase
        .from("game_sessions")
        .select("room_pda, game_type, mode, winner_wallet, status, updated_at")
        .eq("room_pda", roomPda)
        .maybeSingle();

      if (session && session.status === "finished") {
        matchData = {
          room_pda: session.room_pda,
          game_type: session.game_type,
          mode: session.mode,
          winner_wallet: session.winner_wallet,
          loser_wallet: null,
          winner_payout_lamports: null,
          fee_lamports: null,
          win_reason: "unknown",
          finished_at: session.updated_at,
          tx_signature: null,
          stake_lamports: 0,
        };
      }
    }

    if (!matchData) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch winner profile stats (brag-only: wins, win_rate, total_sol_won)
    let winnerProfile = null;
    const winnerWallet = matchData.winner_wallet;

    if (winnerWallet) {
      const { data: profile } = await supabase
        .from("player_profiles")
        .select("wins, win_rate, total_sol_won")
        .eq("wallet", winnerWallet)
        .maybeSingle();

      if (profile) {
        winnerProfile = profile;
      }
    }

    return new Response(
      JSON.stringify({ match: matchData, winnerProfile }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[match-get] Error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
