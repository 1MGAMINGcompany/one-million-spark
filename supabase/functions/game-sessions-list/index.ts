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
    
    const body = await req.json().catch(() => ({}))

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const type = body.type

    console.log('[game-sessions-list] Request type:', type)

    if (type === 'active') {
      // Include active, waiting, cancelled, and finished sessions for room list enrichment + filtering
      const { data, error } = await supabase
        .from('game_sessions')
        .select('room_pda, game_type, status, player1_wallet, player2_wallet, current_turn_wallet, created_at, updated_at, mode, turn_time_seconds')
        .in('status', ['active', 'waiting', 'cancelled', 'finished', 'void'])
        .order('updated_at', { ascending: false })
        .limit(500) // Prevent unbounded results

      if (error) {
        console.error('[game-sessions-list] Query error:', error)
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      console.log('[game-sessions-list] ✅ Found', data?.length || 0, 'active/waiting sessions')
      return new Response(JSON.stringify({ ok: true, rows: data }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (type === 'recoverable_for_wallet') {
      const wallet = body.wallet
      if (!wallet || typeof wallet !== 'string') {
        return new Response(JSON.stringify({ error: 'missing wallet' }), { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      console.log('[game-sessions-list] Fetching recoverable for wallet:', wallet.slice(0, 8))

      const { data, error } = await supabase
        .from('game_sessions')
        .select('room_pda, game_type, status, player1_wallet, player2_wallet, current_turn_wallet, created_at, updated_at, mode, turn_time_seconds')
        .eq('status', 'active')
        .or(`player1_wallet.eq.${wallet},player2_wallet.eq.${wallet}`)
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('[game-sessions-list] Query error:', error)
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      console.log('[game-sessions-list] ✅ Found', data?.length || 0, 'recoverable sessions')
      return new Response(JSON.stringify({ ok: true, rows: data }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'unknown type' }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('[game-sessions-list] Unexpected error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
