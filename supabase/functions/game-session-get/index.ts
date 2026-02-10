import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { data: session1, error: sessionError } = await supabase
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

    let session = session1;

    // Server-side timeout enforcement for active games
    if (session && session.status_int === 2) {
      try {
        const { data: timeoutRes, error: timeoutErr } = await supabase.rpc(
          "maybe_apply_turn_timeout",
          { p_room_pda: roomPda }
        );

        if (timeoutErr) {
          console.warn("[game-session-get] maybe_apply_turn_timeout error (non-fatal):", timeoutErr);
        }

        if (timeoutRes?.applied) {
          console.log("[game-session-get] Timeout applied:", timeoutRes);
          const { data: session2, error: session2Err } = await supabase
            .from("game_sessions")
            .select("*")
            .eq("room_pda", roomPda)
            .maybeSingle();

          if (!session2Err && session2) {
            session = session2;
          }
        }
      } catch (e) {
        console.warn("[game-session-get] maybe_apply_turn_timeout exception (non-fatal):", e);
      }
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

  // PART C FIX: Multiple ways to determine if both players accepted:
  // 1. Count from game_acceptances table
  const fromAcceptances = players.length >= requiredPlayers;
  // 2. Check p1_ready/p2_ready flags (set by record_acceptance RPC)
  const fromSessionFlags = Boolean(session?.p1_ready && session?.p2_ready);
  // 3. If start_roll_finalized is true, both players MUST have been ready
  const fromStartRoll = session?.start_roll_finalized === true;
  // 4. FALLBACK: If participants array has required count, they're implicitly ready
  //    (participants is synced from on-chain data which is authoritative)
  const participantsReady = (session?.participants?.length ?? 0) >= requiredPlayers;

  const bothAccepted = fromAcceptances || fromSessionFlags || fromStartRoll || participantsReady;

  console.log("[game-session-get] Acceptances:", {
    playersCount: players.length,
    requiredPlayers,
    fromAcceptances,
    fromSessionFlags,
    fromStartRoll,
    participantsReady,
    bothAccepted,
  });

  const acceptances = { players, bothAccepted };

  console.log('[game-session-get] ✅ Session found:', !!session, 'Receipt:', !!receipt, 'Match:', !!match, 'Acceptances:', players.length, 'Participants:', session?.participants?.length ?? 0)
    
  // Return backward-compatible response: { ok, session } plus optional receipt/match/acceptances
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
