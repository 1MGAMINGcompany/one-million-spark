import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * prediction-auto-settle
 * Cron-triggered edge function that auto-settles confirmed fights
 * once their claims_open_at has elapsed.
 * 
 * This is a safety net: if the admin doesn't manually press "Settle Event",
 * this function will do it automatically every minute.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Kill switch check ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("automation_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.automation_enabled) {
      return new Response(JSON.stringify({ settled: 0, message: "Automation disabled by admin" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all confirmed fights where claims_open_at has passed
    const { data: fights, error: fetchErr } = await supabase
      .from("prediction_fights")
      .select("id, claims_open_at, status")
      .eq("status", "confirmed")
      .not("claims_open_at", "is", null)
      .lte("claims_open_at", new Date().toISOString());

    if (fetchErr) throw fetchErr;

    if (!fights || fights.length === 0) {
      return new Response(JSON.stringify({ settled: 0, message: "No fights ready to auto-settle" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const fight of fights) {
      const { data, error } = await supabase
        .from("prediction_fights")
        .update({
          status: "settled",
          settled_at: new Date().toISOString(),
        })
        .eq("id", fight.id)
        .eq("status", "confirmed") // double-check to prevent race
        .select()
        .single();

      if (error) {
        results.push({ id: fight.id, ok: false, error: error.message });
      } else {
        results.push({ id: fight.id, ok: true });
        console.log(`[auto-settle] Settled fight ${fight.id}`);
      }
    }

    return new Response(JSON.stringify({ settled: results.filter(r => r.ok).length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-settle] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
