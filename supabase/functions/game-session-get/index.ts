import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-join-trace-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // Extract join trace correlation ID if present (for debugging)
    const traceId = req.headers.get('X-Join-Trace-Id') || null;
    if (traceId) {
      console.log('[game-session-get] traceId:', traceId, 'roomPda:', roomPda.slice(0, 8));
    } else {
      console.log('[game-session-get] Fetching session for roomPda:', roomPda.slice(0, 8));
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Fetch game session
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('*, max_players, eliminated_players')
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

    // 🔍 DEBUG: Count player_sessions rows for this room
    const { count: playerSessionsCount, error: psCountError } = await supabase
      .from('player_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('room_pda', roomPda)

    if (psCountError) {
      console.warn('[game-session-get] player_sessions count error (non-fatal):', psCountError)
    }

    // 🔍 DEBUG: Count game_acceptances rows for this room
    const { count: acceptancesCount, error: accCountError } = await supabase
      .from('game_acceptances')
      .select('*', { count: 'exact', head: true })
      .eq('room_pda', roomPda)

    if (accCountError) {
      console.warn('[game-session-get] game_acceptances count error (non-fatal):', accCountError)
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
  
  // DETERMINISTIC requiredCount from max_players (authoritative)
  // For Chess: max_players=2, for Ludo: max_players=4
  const requiredCount =
    typeof session?.max_players === "number" && session.max_players >= 1
      ? session.max_players
      : 2;

  // Get participants array from session (for N-player)
  const participants: string[] = session?.participants || [];

  // Create set of accepted wallets for membership check
  const acceptedWallets = new Set(players.map(p => p.wallet));

  // STRICT: acceptedCount must meet requiredCount - no fallbacks
  const acceptedCount = acceptedWallets.size;
  const bothAccepted = acceptedCount >= requiredCount;

  console.log("[game-session-get] Acceptances:", {
    acceptedCount,
    requiredCount,
    max_players: session?.max_players,
    participantsCount: participants.length,
    bothAccepted,
  });

  const acceptances = { 
    players, 
    bothAccepted,
    acceptedCount,
    requiredCount,
  };

  console.log('[game-session-get] ✅ Session found:', !!session, 'Receipt:', !!receipt, 'Match:', !!match, 'Acceptances:', players.length)

  // 🔍 DEBUG: Build debug info object
  const debugInfo = {
    roomPda,
    status_int: session?.status_int ?? null,
    status: session?.status ?? null,
    player1_wallet: session?.player1_wallet?.slice(0, 8) ?? null,
    player2_wallet: session?.player2_wallet?.slice(0, 8) ?? null,
    participants: session?.participants ?? [],
    participantsCount: session?.participants?.length ?? 0,
    mode: session?.mode ?? null,
    max_players: session?.max_players ?? null,
    requiredCount,
    acceptedCount,
    bothAccepted,
    p1_ready: session?.p1_ready ?? false,
    p2_ready: session?.p2_ready ?? false,
    start_roll_finalized: session?.start_roll_finalized ?? false,
    player_sessions_count: playerSessionsCount ?? 0,
    game_acceptances_count: acceptancesCount ?? 0,
    timestamp: new Date().toISOString(),
  }
    
  // Return backward-compatible response: { ok, session } plus optional receipt/match/acceptances + debug
  return new Response(JSON.stringify({ 
    ok: true, 
    session, 
    receipt: receipt || null,
    match: match || null,
    acceptances,
    debug: debugInfo,
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
