import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── In-memory TTL cache (survives across requests within same isolate) ──
interface CacheEntry { data: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10_000 // 10 seconds

function getCached(key: string): unknown | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.data
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  // Evict stale entries periodically (keep map small)
  if (cache.size > 50) {
    const now = Date.now()
    for (const [k, v] of cache) { if (now > v.expiresAt) cache.delete(k) }
  }
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
    const type = body.type

    console.log('[game-sessions-list] Request type:', type)

    // ── Check cache first for cacheable request types ──
    const cacheKey = type === 'recoverable_for_wallet'
      ? `${type}:${body.wallet || ''}`
      : type
    
    if (type === 'active' || type === 'free_rooms_public' || type === 'recoverable_for_wallet') {
      const cached = getCached(cacheKey)
      if (cached) {
        console.log('[game-sessions-list] ⚡ Cache HIT for', cacheKey)
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    if (type === 'active') {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('room_pda, game_type, status, player1_wallet, player2_wallet, current_turn_wallet, created_at, updated_at, mode, turn_time_seconds')
        .in('status', ['active', 'waiting', 'cancelled', 'finished', 'void'])
        .order('updated_at', { ascending: false })
        .limit(500)

      if (error) {
        console.error('[game-sessions-list] Query error:', error)
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      console.log('[game-sessions-list] ✅ Found', data?.length || 0, 'active/waiting sessions')
      const result = { ok: true, rows: data }
      setCache(cacheKey, result)
      return new Response(JSON.stringify(result), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (type === 'free_rooms_public') {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('game_sessions')
        .select('room_pda, game_type, status, player1_wallet, player2_wallet, created_at, max_players, mode')
        .eq('mode', 'free')
        .eq('status', 'waiting')
        .gte('created_at', fifteenMinAgo)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('[game-sessions-list] free_rooms_public error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      console.log('[game-sessions-list] ✅ Found', data?.length || 0, 'public free rooms')
      const result = { ok: true, rows: data }
      setCache(cacheKey, result)
      return new Response(JSON.stringify(result), {
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

      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('game_sessions')
        .select('room_pda, game_type, status, player1_wallet, player2_wallet, current_turn_wallet, created_at, updated_at, mode, turn_time_seconds')
        .or(
          `and(status.eq.active,or(player1_wallet.eq.${wallet},player2_wallet.eq.${wallet})),` +
          `and(status.eq.waiting,mode.eq.free,player1_wallet.eq.${wallet},created_at.gte.${fifteenMinAgo})`
        )
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('[game-sessions-list] Query error:', error)
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      console.log('[game-sessions-list] ✅ Found', data?.length || 0, 'recoverable sessions')
      const result = { ok: true, rows: data }
      setCache(cacheKey, result)
      return new Response(JSON.stringify(result), { 
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