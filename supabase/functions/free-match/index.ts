import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action } = body

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // ── find_or_create ──
    if (action === 'find_or_create') {
      const { gameType, wallet, maxPlayers = 2 } = body

      if (!gameType || !wallet) {
        return new Response(JSON.stringify({ error: 'missing gameType or wallet' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        .neq('player1_wallet', wallet)
        .gte('created_at', fifteenMinAgo)
        .order('created_at', { ascending: true })
        .limit(1)

      if (searchErr) {
        console.error('[free-match] search error:', searchErr)
        return new Response(JSON.stringify({ error: searchErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (waiting && waiting.length > 0) {
        const room = waiting[0]

        // Idempotent: if already joined by same wallet, return joined
        if (room.player2_wallet === wallet) {
          return new Response(JSON.stringify({ status: 'joined', roomPda: room.room_pda }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Join the room
        const { error: joinErr } = await supabase
          .from('game_sessions')
          .update({
            player2_wallet: wallet,
            participants: [room.player1_wallet, wallet],
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
          .eq('status', 'waiting') // Prevent race condition

        if (joinErr) {
          console.error('[free-match] join error:', joinErr)
          return new Response(JSON.stringify({ error: joinErr.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log('[free-match] Joined existing room:', room.room_pda.slice(0, 12))
        return new Response(JSON.stringify({ status: 'joined', roomPda: room.room_pda }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // No match found — create new free room
      const roomPda = 'free-' + crypto.randomUUID()

      const { error: insertErr } = await supabase
        .from('game_sessions')
        .insert({
          room_pda: roomPda,
          game_type: gameType,
          mode: 'free',
          status: 'waiting',
          status_int: 1,
          max_players: maxPlayers,
          player1_wallet: wallet,
          participants: [wallet],
          p1_ready: false,
          p2_ready: false,
          start_roll_finalized: false,
          game_state: {},
          waiting_started_at: new Date().toISOString(),
        })

      if (insertErr) {
        console.error('[free-match] insert error:', insertErr)
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('[free-match] Created new room:', roomPda.slice(0, 16))
      return new Response(JSON.stringify({ status: 'created', roomPda }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── check ──
    if (action === 'check') {
      const { roomPda } = body

      if (!roomPda) {
        return new Response(JSON.stringify({ error: 'missing roomPda' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: session, error } = await supabase
        .from('game_sessions')
        .select('status, status_int, player2_wallet, player1_wallet, participants')
        .eq('room_pda', roomPda)
        .maybeSingle()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true, session }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── cancel ──
    if (action === 'cancel') {
      const { roomPda, wallet } = body

      if (!roomPda || !wallet) {
        return new Response(JSON.stringify({ error: 'missing roomPda or wallet' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: session, error: fetchErr } = await supabase
        .from('game_sessions')
        .select('player1_wallet, status')
        .eq('room_pda', roomPda)
        .maybeSingle()

      if (fetchErr || !session) {
        return new Response(JSON.stringify({ error: 'Room not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (session.player1_wallet !== wallet) {
        return new Response(JSON.stringify({ error: 'Only creator can cancel' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (session.status !== 'waiting') {
        return new Response(JSON.stringify({ error: 'Can only cancel waiting rooms' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
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
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('[free-match] Cancelled room:', roomPda.slice(0, 16))
      return new Response(JSON.stringify({ status: 'cancelled' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[free-match] Unexpected error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
