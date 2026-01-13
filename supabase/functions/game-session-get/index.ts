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

    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('room_pda', roomPda)
      .maybeSingle()

    if (error) {
      console.error('[game-session-get] Query error:', error)
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    console.log('[game-session-get] ✅ Session found:', !!data)
    return new Response(JSON.stringify({ ok: true, session: data }), { 
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
