import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

  console.log('[game-session-get] ✅ Session found:', !!session, 'Receipt:', !!receipt, 'Match:', !!match, 'Acceptances:', players.length)
    
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
