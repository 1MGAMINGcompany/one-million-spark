import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const roomPda = url.searchParams.get('roomPda');

    if (!roomPda || roomPda.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid roomPda parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch from match_share_cards
    const { data, error } = await supabase
      .from("match_share_cards")
      .select(`
        room_pda,
        created_at,
        mode,
        game_type,
        winner_wallet,
        loser_wallet,
        win_reason,
        stake_lamports,
        winner_rank_before,
        winner_rank_after,
        loser_rank_before,
        loser_rank_after,
        tx_signature
      `)
      .eq("room_pda", roomPda)
      .single();

    if (error || !data) {
      console.log("[match-get] Not found:", roomPda.slice(0, 8), error?.message);
      return new Response(
        JSON.stringify({ error: 'Match not found', roomPda }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("[match-get] ✅ Found match:", roomPda.slice(0, 8), data.game_type);

    return new Response(
      JSON.stringify({ success: true, match: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error("[match-get] Error:", err);
    return new Response(
      JSON.stringify({ error: 'Server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
