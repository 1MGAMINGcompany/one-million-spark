import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ 
      ok: true, 
      ts: new Date().toISOString(),
      region: Deno.env.get("DENO_REGION") || "unknown"
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
