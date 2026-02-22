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

      // ── Prevent duplicate rooms: check if player already has an open free room ──
      const { data: existingRooms, error: existingErr } = await supabase
        .from('game_sessions')
        .select('room_pda, status, game_type, participants, max_players')
        .eq('mode', 'free')
        .in('status', ['waiting', 'active'])
        .contains('participants', [playerId])
        .limit(1)

      if (!existingErr && existingRooms && existingRooms.length > 0) {
        const existing = existingRooms[0]
        console.log('[free-match] Player already has active free room:', existing.room_pda.slice(0, 16))
        return json({
          status: existing.status === 'active' ? 'joined' : 'already_has_room',
          roomPda: existing.room_pda,
          existingGameType: existing.game_type,
          existingStatus: existing.status,
        })
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

        // Already joined by same player?
        const existingParticipants: string[] = room.participants || []
        if (existingParticipants.includes(playerId)) {
          return json({ status: 'joined', roomPda: room.room_pda })
        }

        // Merge display names
        const existingNames = (room.display_names as Record<string, string>) || {}
        const mergedNames = { ...existingNames, [playerId]: displayName || `Guest-${playerId.slice(-4).toUpperCase()}` }
        const newParticipants = [...existingParticipants, playerId]
        const isFull = newParticipants.length >= maxPlayers

        // Build update payload
        const updatePayload: Record<string, unknown> = {
          participants: newParticipants,
          display_names: mergedNames,
          updated_at: new Date().toISOString(),
        }

        // For 2-player: set player2_wallet
        if (!room.player2_wallet) {
          updatePayload.player2_wallet = playerId
        }

        // Only activate when all slots are filled
        if (isFull) {
          updatePayload.status = 'active'
          updatePayload.status_int = 2
          updatePayload.current_turn_wallet = room.player1_wallet
          updatePayload.starting_player_wallet = room.player1_wallet
          updatePayload.p1_ready = true
          updatePayload.p2_ready = true
          updatePayload.start_roll_finalized = true
          updatePayload.turn_started_at = new Date().toISOString()
          updatePayload.waiting_started_at = null
        }

        const { error: joinErr } = await supabase
          .from('game_sessions')
          .update(updatePayload)
          .eq('room_pda', room.room_pda)
          .eq('status', 'waiting')

        if (joinErr) {
          console.error('[free-match] join error:', joinErr)
          return json({ error: joinErr.message }, 500)
        }

        const joinStatus = isFull ? 'joined' : 'waiting_for_more'
        console.log(`[free-match] Player joined room (${newParticipants.length}/${maxPlayers}):`, room.room_pda.slice(0, 12))
        return json({ status: joinStatus, roomPda: room.room_pda, playersJoined: newParticipants.length, maxPlayers })
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
        .select('status, status_int, player1_wallet, player2_wallet, participants, display_names, max_players')
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
        .select('player1_wallet, player2_wallet, status, status_int, participants')
        .eq('room_pda', roomPda)
        .maybeSingle()

      if (fetchErr || !session) {
        return json({ error: 'Room not found' }, 404)
      }

      // Allow leaving both active and waiting rooms
      if (session.status !== 'active' && session.status !== 'waiting') {
        return json({ error: 'Room not active or waiting' }, 400)
      }

      const participants: string[] = session.participants || []
      if (!participants.includes(playerId)) {
        return json({ error: 'Not a participant' }, 403)
      }

      // If room is waiting and player is not creator, just remove them from participants
      if (session.status === 'waiting' && session.player1_wallet !== playerId) {
        const newParticipants = participants.filter(p => p !== playerId)
        const updatePayload: Record<string, unknown> = {
          participants: newParticipants,
          updated_at: new Date().toISOString(),
        }
        // Clear player2 if they were player2
        if (session.player2_wallet === playerId) {
          updatePayload.player2_wallet = null
        }
        const { error: updateErr } = await supabase
          .from('game_sessions')
          .update(updatePayload)
          .eq('room_pda', roomPda)

        if (updateErr) {
          return json({ error: updateErr.message }, 500)
        }
        return json({ status: 'left' })
      }

      // Active game: determine winner (the other players continue, or single opponent wins)
      let winnerWallet: string | null = null
      if (session.player1_wallet === playerId) {
        winnerWallet = session.player2_wallet
      } else if (session.player2_wallet === playerId) {
        winnerWallet = session.player1_wallet
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

      const existingParticipants: string[] = room.participants || []

      // Already a participant?
      if (existingParticipants.includes(playerId)) {
        return json({ status: room.player1_wallet === playerId ? 'rejoined' : 'joined', roomPda })
      }

      // Room full?
      if (existingParticipants.length >= room.max_players) {
        return json({ error: 'Room is full' }, 409)
      }

      // Merge display names
      const existingNames = (room.display_names as Record<string, string>) || {}
      const mergedNames = { ...existingNames, [playerId]: displayName || `Guest-${playerId.slice(-4).toUpperCase()}` }
      const newParticipants = [...existingParticipants, playerId]
      const isFull = newParticipants.length >= room.max_players

      const updatePayload: Record<string, unknown> = {
        participants: newParticipants,
        display_names: mergedNames,
        updated_at: new Date().toISOString(),
      }

      if (!room.player2_wallet) {
        updatePayload.player2_wallet = playerId
      }

      if (isFull) {
        updatePayload.status = 'active'
        updatePayload.status_int = 2
        updatePayload.current_turn_wallet = room.player1_wallet
        updatePayload.starting_player_wallet = room.player1_wallet
        updatePayload.p1_ready = true
        updatePayload.p2_ready = true
        updatePayload.start_roll_finalized = true
        updatePayload.turn_started_at = new Date().toISOString()
        updatePayload.waiting_started_at = null
      }

      const { error: joinErr } = await supabase
        .from('game_sessions')
        .update(updatePayload)
        .eq('room_pda', roomPda)
        .eq('status', 'waiting')

      if (joinErr) {
        console.error('[free-match] join_specific error:', joinErr)
        return json({ error: joinErr.message }, 500)
      }

      const joinStatus = isFull ? 'joined' : 'waiting_for_more'
      console.log(`[free-match] join_specific (${newParticipants.length}/${room.max_players}):`, roomPda.slice(0, 16))
      return json({ status: joinStatus, roomPda, playersJoined: newParticipants.length, maxPlayers: room.max_players })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('[free-match] Unexpected error:', e)
    return json({ error: String(e) }, 500)
  }
})
