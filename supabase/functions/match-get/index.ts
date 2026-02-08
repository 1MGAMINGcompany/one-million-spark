import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to convert lamports to SOL
function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

// Shorten wallet address for display
function shortenAddress(address: string | null, chars = 4): string {
  if (!address) return "—";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

interface MatchGetRequest {
  roomPda: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as MatchGetRequest;
    const roomPda = body.roomPda;

    if (!roomPda) {
      return new Response(
        JSON.stringify({ error: "Missing roomPda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[match-get] Fetching match data for ${roomPda}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch match share card
    const { data: matchCard, error: matchError } = await supabase
      .from("match_share_cards")
      .select("*")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (matchError) {
      console.error("[match-get] Error fetching match_share_cards:", matchError);
      return new Response(
        JSON.stringify({ error: "Database error", details: matchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!matchCard) {
      // Try to get from game_sessions as fallback
      const { data: session, error: sessionError } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("room_pda", roomPda)
        .maybeSingle();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ error: "Match not found", roomPda }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build basic response from session
      return new Response(
        JSON.stringify({
          ok: true,
          match: {
            room_pda: roomPda,
            game_type: session.game_type,
            mode: session.mode || "casual",
            status: session.status,
            winner_wallet: session.winner_wallet,
            loser_wallet: null,
            stake_lamports: 0,
            stake_sol: 0,
            winner_payout_sol: 0,
            fee_sol: 0,
            finished_at: session.game_over_at || session.updated_at,
            win_reason: "gameover",
            winner_display: shortenAddress(session.winner_wallet),
            loser_display: null,
            source: "game_sessions",
          },
          winner_profile: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute derived display fields
    const stakeLamports = matchCard.stake_lamports || 0;
    const stakeSol = lamportsToSol(stakeLamports);
    const potLamports = stakeLamports * 2; // 2-player games
    const feeBps = 500; // 5%
    const feeLamports = matchCard.fee_lamports || Math.floor(potLamports * feeBps / 10000);
    const winnerPayoutLamports = matchCard.winner_payout_lamports || (potLamports - feeLamports);

    const matchData = {
      ...matchCard,
      stake_sol: stakeSol,
      pot_sol: lamportsToSol(potLamports),
      fee_sol: lamportsToSol(feeLamports),
      winner_payout_sol: lamportsToSol(winnerPayoutLamports),
      winner_display: shortenAddress(matchCard.winner_wallet),
      loser_display: shortenAddress(matchCard.loser_wallet),
      source: "match_share_cards",
    };

    // Fetch winner profile stats if available
    let winnerProfile = null;
    if (matchCard.winner_wallet) {
      const { data: profile } = await supabase
        .from("player_profiles")
        .select("total_sol_won, current_streak, favorite_game, wins, losses, games_played")
        .eq("wallet", matchCard.winner_wallet)
        .maybeSingle();

      if (profile) {
        winnerProfile = {
          total_sol_won: profile.total_sol_won || 0,
          current_streak: profile.current_streak || 0,
          favorite_game: profile.favorite_game,
          wins: profile.wins || 0,
          losses: profile.losses || 0,
          games_played: profile.games_played || 0,
        };
      }
    }

    console.log(`[match-get] Found match for ${roomPda}:`, {
      game_type: matchData.game_type,
      winner: matchData.winner_display,
      stake_sol: matchData.stake_sol,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        match: matchData,
        winner_profile: winnerProfile,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Internal server error";
    console.error("[match-get] Error:", e);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
