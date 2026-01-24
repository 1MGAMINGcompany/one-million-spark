import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { roomPda } = await req.json()
    if (!roomPda || typeof roomPda !== 'string') {
      return new Response(JSON.stringify({ error: 'missing roomPda' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('[game-session-get] Fetching session for roomPda:', roomPda.slice(0, 8))

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Fetch game session
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('room_pda', roomPda)
      .maybeSingle()

    if (sessionError) {
      console.error('[game-session-get] Session query error:', sessionError)
      return new Response(JSON.stringify({ error: sessionError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch finalize receipt (settlement status) - optional field
    const { data: receipt, error: receiptError } = await supabase
      .from('finalize_receipts')
      .select('finalize_tx, created_at')
      .eq('room_pda', roomPda)
      .maybeSingle()

    if (receiptError) {
      console.warn('[game-session-get] Receipt query error (non-fatal):', receiptError)
    }

    // Fetch match info - optional field
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('winner_wallet, status, finalized_at')
      .eq('room_pda', roomPda)
      .maybeSingle()

    if (matchError) {
      console.warn('[game-session-get] Match query error (non-fatal):', matchError)
    }

    // Fetch acceptances for this room (for readiness polling)
    const { data: rawAcceptances, error: acceptanceError } = await supabase
      .from('game_acceptances')
      .select('player_wallet, created_at')
      .eq('room_pda', roomPda)

    if (acceptanceError) {
      console.warn('[game-session-get] Acceptance query error (non-fatal):', acceptanceError)
    }

    // Deduplicate by player_wallet (in case of duplicate inserts)
    const byWallet = new Map<string, { wallet: string; accepted_at: string }>();
    for (const a of rawAcceptances ?? []) {
      if (!byWallet.has(a.player_wallet)) {
        byWallet.set(a.player_wallet, { wallet: a.player_wallet, accepted_at: a.created_at });
      }
    }
    const players = Array.from(byWallet.values()).map(p => ({ ...p, accepted: true }));

    // Get required players from session (default 2)
    const requiredPlayers = session?.max_players ?? 2;

    // Multiple ways to determine if both players accepted
    const fromAcceptances = players.length >= requiredPlayers;
    const fromSessionFlags = Boolean(session?.p1_ready && session?.p2_ready);
    const fromStartRoll = session?.start_roll_finalized === true;

    const bothAccepted = fromAcceptances || fromSessionFlags || fromStartRoll;

    console.log("[game-session-get] Acceptances:", {
      playersCount: players.length,
      requiredPlayers,
      fromAcceptances,
      fromSessionFlags,
      fromStartRoll,
      bothAccepted,
    });

    const acceptances = { players, bothAccepted };

    console.log('[game-session-get] ✅ Session found:', !!session, 'Receipt:', !!receipt, 'Match:', !!match, 'Acceptances:', players.length)

    // Return backward-compatible response
    return new Response(JSON.stringify({
      ok: true,
      session,
      receipt: receipt || null,
      match: match || null,
      acceptances,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('[game-session-get] Unexpected error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
