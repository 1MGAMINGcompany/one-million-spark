import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, sessionId } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "heartbeat") {
      if (!sessionId || typeof sessionId !== "string" || sessionId.length > 64) {
        return new Response(JSON.stringify({ error: "invalid session_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("presence_heartbeats")
        .upsert({ session_id: sessionId, last_seen: new Date().toISOString() }, { onConflict: "session_id" });

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "stats") {
      // Count browsing (heartbeats in last 2 minutes)
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { count: browsing, error: e1 } = await supabase
        .from("presence_heartbeats")
        .select("*", { count: "exact", head: true })
        .gte("last_seen", twoMinAgo);

      if (e1) throw e1;

      // Count rooms waiting (status_int = 1, created in last 15 min)
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: roomsWaiting, error: e2 } = await supabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("status_int", 1)
        .gte("created_at", fifteenMinAgo);

      if (e2) throw e2;

      // Garbage collect old heartbeats (older than 5 min)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await supabase
        .from("presence_heartbeats")
        .delete()
        .lt("last_seen", fiveMinAgo);

      return new Response(
        JSON.stringify({ browsing: browsing ?? 0, roomsWaiting: roomsWaiting ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[live-stats]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
