import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * prediction-schedule-worker
 * Cron-triggered: locks approved events at scheduled_lock_at,
 * marks them live at scheduled_live_at.
 * 
 * Safety:
 * - Respects global automation_enabled kill switch
 * - Respects per-event automation_paused flag
 * - Only touches approved events
 * - Never changes wallet logic
 * - Logs every action to automation_logs
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

    // ── Global kill switch ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("automation_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.automation_enabled) {
      return json({ processed: 0, message: "Automation disabled globally" });
    }

    const now = new Date().toISOString();
    const results: { action: string; event_id: string; ok: boolean; error?: string }[] = [];

    // ── Phase 1: Lock events at scheduled_lock_at ──
    const { data: lockable } = await supabase
      .from("prediction_events")
      .select("id, event_name, scheduled_lock_at")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_lock_at", "is", null)
      .lte("scheduled_lock_at", now);

    for (const evt of lockable ?? []) {
      // Lock all open fights under this event
      const { data: fights, error: fErr } = await supabase
        .from("prediction_fights")
        .update({ status: "locked" })
        .eq("event_id", evt.id)
        .eq("status", "open")
        .select("id");

      if (fErr) {
        results.push({ action: "lock_fights", event_id: evt.id, ok: false, error: fErr.message });
        continue;
      }

      const lockedCount = fights?.length ?? 0;

      // Log
      await supabase.from("automation_logs").insert({
        action: "schedule_lock",
        event_id: evt.id,
        source: "prediction-schedule-worker",
        details: { locked_fights: lockedCount, event_name: evt.event_name },
      });

      results.push({ action: "lock_fights", event_id: evt.id, ok: true });
      console.log(`[schedule-worker] Locked ${lockedCount} fights for event ${evt.id}`);
    }

    // ── Phase 2: Mark events live at scheduled_live_at ──
    const { data: liveable } = await supabase
      .from("prediction_events")
      .select("id, event_name, scheduled_live_at")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_live_at", "is", null)
      .lte("scheduled_live_at", now);

    for (const evt of liveable ?? []) {
      // Mark all locked fights under this event as live
      const { data: fights, error: fErr } = await supabase
        .from("prediction_fights")
        .update({ status: "live" })
        .eq("event_id", evt.id)
        .eq("status", "locked")
        .select("id");

      if (fErr) {
        results.push({ action: "mark_live", event_id: evt.id, ok: false, error: fErr.message });
        continue;
      }

      const liveCount = fights?.length ?? 0;

      // Log
      await supabase.from("automation_logs").insert({
        action: "schedule_live",
        event_id: evt.id,
        source: "prediction-schedule-worker",
        details: { live_fights: liveCount, event_name: evt.event_name },
      });

      results.push({ action: "mark_live", event_id: evt.id, ok: true });
      console.log(`[schedule-worker] Marked ${liveCount} fights live for event ${evt.id}`);
    }

    return json({
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error("[schedule-worker] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
