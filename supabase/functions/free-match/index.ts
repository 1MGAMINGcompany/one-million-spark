import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const body = await req.json()
    const { action } = body

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Resolve the player identity — supports both wallet (legacy) and playerId (anon)
    const resolvePlayer = () => {
      const id = body.playerId || body.wallet
      if (!id) return null
      return id as string
    }

    // ── find_or_create ──
    if (action === 'find_or_create') {
      const { gameType, displayName, maxPlayers = 2 } = body
      const playerId = resolvePlayer()

      if (!gameType || !playerId) {
        return json({ error: 'missing gameType or player identity' }, 400)
      }

      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

      // Search for existing waiting free room
      const { data: waiting, error: searchErr } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('mode', 'free')
        .eq('status', 'waiting')
        .eq('game_type', gameType)
        .eq('max_players', maxPlayers)
        .neq('player1_wallet', playerId)
        .gte('created_at', fifteenMinAgo)
        .order('created_at', { ascending: true })
        .limit(1)

      if (searchErr) {
        console.error('[free-match] search error:', searchErr)
        return json({ error: searchErr.message }, 500)
      }

      if (waiting && waiting.length > 0) {
        const room = waiting[0]

        // Idempotent: if already joined by same player
        if (room.player2_wallet === playerId) {
          return json({ status: 'joined', roomPda: room.room_pda })
        }

        // Merge display names
        const existingNames = (room.display_names as Record<string, string>) || {}
        const mergedNames = { ...existingNames, [playerId]: displayName || `Guest-${playerId.slice(-4).toUpperCase()}` }

        // Join the room
        const { error: joinErr } = await supabase
          .from('game_sessions')
          .update({
            player2_wallet: playerId,
            participants: [room.player1_wallet, playerId],
            display_names: mergedNames,
            status: 'active',
            status_int: 2,
            current_turn_wallet: room.player1_wallet,
            starting_player_wallet: room.player1_wallet,
            p1_ready: true,
            p2_ready: true,
            start_roll_finalized: true,
            turn_started_at: new Date().toISOString(),
            waiting_started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('room_pda', room.room_pda)
          .eq('status', 'waiting')

        if (joinErr) {
          console.error('[free-match] join error:', joinErr)
          return json({ error: joinErr.message }, 500)
        }

        console.log('[free-match] Joined existing room:', room.room_pda.slice(0, 12))
        return json({ status: 'joined', roomPda: room.room_pda })
      }

      // No match found — create new free room
      const roomPda = 'free-' + crypto.randomUUID()
      const creatorName = displayName || `Guest-${playerId.slice(-4).toUpperCase()}`

      const { error: insertErr } = await supabase
        .from('game_sessions')
        .insert({
          room_pda: roomPda,
          game_type: gameType,
          mode: 'free',
          status: 'waiting',
          status_int: 1,
          max_players: maxPlayers,
          player1_wallet: playerId,
          participants: [playerId],
          display_names: { [playerId]: creatorName },
          p1_ready: false,
          p2_ready: false,
          start_roll_finalized: false,
          game_state: {},
          waiting_started_at: new Date().toISOString(),
        })

      if (insertErr) {
        console.error('[free-match] insert error:', insertErr)
        return json({ error: insertErr.message }, 500)
      }

      console.log('[free-match] Created new room:', roomPda.slice(0, 16))
      return json({ status: 'created', roomPda })
    }

    // ── check ──
    if (action === 'check') {
      const { roomPda } = body

      if (!roomPda) {
        return json({ error: 'missing roomPda' }, 400)
      }

      const { data: session, error } = await supabase
        .from('game_sessions')
        .select('status, status_int, player2_wallet, player1_wallet, participants, display_names')
        .eq('room_pda', roomPda)
        .maybeSingle()

      if (error) {
        return json({ error: error.message }, 500)
      }

      return json({ ok: true, session })
    }

    // ── cancel ──
    if (action === 'cancel') {
      const { roomPda } = body
      const playerId = resolvePlayer()

      if (!roomPda || !playerId) {
        return json({ error: 'missing roomPda or player identity' }, 400)
      }

      const { data: session, error: fetchErr } = await supabase
        .from('game_sessions')
        .select('player1_wallet, status')
        .eq('room_pda', roomPda)
        .maybeSingle()

      if (fetchErr || !session) {
        return json({ error: 'Room not found' }, 404)
      }

      if (session.player1_wallet !== playerId) {
        return json({ error: 'Only creator can cancel' }, 403)
      }

      if (session.status !== 'waiting') {
        return json({ error: 'Can only cancel waiting rooms' }, 400)
      }

      const { error: updateErr } = await supabase
        .from('game_sessions')
        .update({
          status: 'cancelled',
          status_int: 5,
          game_over_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('room_pda', roomPda)

      if (updateErr) {
        return json({ error: updateErr.message }, 500)
      }

      console.log('[free-match] Cancelled room:', roomPda.slice(0, 16))
      return json({ status: 'cancelled' })
    }

    // ── leave ── (for active free games)
    if (action === 'leave') {
      const { roomPda } = body
      const playerId = resolvePlayer()

      if (!roomPda || !playerId) {
        return json({ error: 'missing roomPda or player identity' }, 400)
      }

      const { data: session, error: fetchErr } = await supabase
        .from('game_sessions')
        .select('player1_wallet, player2_wallet, status, status_int')
        .eq('room_pda', roomPda)
        .maybeSingle()

      if (fetchErr || !session) {
        return json({ error: 'Room not found' }, 404)
      }

      // Only allow leaving active free games
      if (session.status !== 'active') {
        return json({ error: 'Room not active' }, 400)
      }

      // Determine winner (the other player)
      let winnerWallet: string | null = null
      if (session.player1_wallet === playerId) {
        winnerWallet = session.player2_wallet
      } else if (session.player2_wallet === playerId) {
        winnerWallet = session.player1_wallet
      } else {
        return json({ error: 'Not a participant' }, 403)
      }

      const { error: updateErr } = await supabase
        .from('game_sessions')
        .update({
          status: 'finished',
          status_int: 3,
          winner_wallet: winnerWallet,
          game_over_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('room_pda', roomPda)

      if (updateErr) {
        return json({ error: updateErr.message }, 500)
      }

      console.log('[free-match] Player left room:', roomPda.slice(0, 16))
      return json({ status: 'left', winnerWallet })
    }

    // ── join_specific ──
    if (action === 'join_specific') {
      const { roomPda, displayName } = body
      const playerId = resolvePlayer()

      if (!roomPda || !playerId) {
        return json({ error: 'missing roomPda or player identity' }, 400)
      }

      const { data: room, error: fetchErr } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_pda', roomPda)
        .maybeSingle()

      if (fetchErr || !room) {
        return json({ error: 'Room not found' }, 404)
      }

      if (room.status !== 'waiting') {
        return json({ error: 'Room no longer available', status: room.status }, 409)
      }

      if (room.player1_wallet === playerId) {
        return json({ status: 'rejoined', roomPda })
      }

      if (room.player2_wallet === playerId) {
        return json({ status: 'joined', roomPda })
      }

      // Merge display names
      const existingNames = (room.display_names as Record<string, string>) || {}
      const mergedNames = { ...existingNames, [playerId]: displayName || `Guest-${playerId.slice(-4).toUpperCase()}` }

      const { error: joinErr } = await supabase
        .from('game_sessions')
        .update({
          player2_wallet: playerId,
          participants: [room.player1_wallet, playerId],
          display_names: mergedNames,
          status: 'active',
          status_int: 2,
          current_turn_wallet: room.player1_wallet,
          starting_player_wallet: room.player1_wallet,
          p1_ready: true,
          p2_ready: true,
          start_roll_finalized: true,
          turn_started_at: new Date().toISOString(),
          waiting_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('room_pda', roomPda)
        .eq('status', 'waiting')

      if (joinErr) {
        console.error('[free-match] join_specific error:', joinErr)
        return json({ error: joinErr.message }, 500)
      }

      console.log('[free-match] join_specific succeeded:', roomPda.slice(0, 16))
      return json({ status: 'joined', roomPda })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('[free-match] Unexpected error:', e)
    return json({ error: String(e) }, 500)
  }
})
