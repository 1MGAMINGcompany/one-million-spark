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
 * Sport-specific behavior:
 * - MMA: lock at event start time (scheduled_lock_at = event_date)
 * - Soccer: lock 5 minutes before kickoff (set during ingest)
 * 
 * Safety:
 * - Respects global automation_enabled kill switch
 * - Respects per-event automation_paused flag
 * - Only touches approved events
 * - Never changes wallet logic
 * - Logs every action to automation_logs
 * - Idempotent: won't re-lock already locked fights
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

    const now = new Date();
    const nowISO = now.toISOString();
    const results: { action: string; event_id: string; ok: boolean; error?: string }[] = [];

    console.log(`[schedule-worker] Run started at ${nowISO}`);

    // ── Phase 1: Lock events at scheduled_lock_at ──
    const { data: lockable } = await supabase
      .from("prediction_events")
      .select("id, event_name, event_date, scheduled_lock_at, scheduled_live_at, source_provider, source_event_id")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_lock_at", "is", null)
      .lte("scheduled_lock_at", nowISO);

    for (const evt of lockable ?? []) {
      console.log(`[schedule-worker] Lock candidate: event=${evt.id} provider=${evt.source_provider} source_id=${evt.source_event_id} event_date=${evt.event_date} scheduled_lock_at=${evt.scheduled_lock_at} scheduled_live_at=${evt.scheduled_live_at} server_time=${nowISO}`);

      // Only lock fights that are still open (idempotent)
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

      if (lockedCount > 0) {
        await supabase.from("automation_logs").insert({
          action: "schedule_lock",
          event_id: evt.id,
          source: "prediction-schedule-worker",
          details: {
            locked_fights: lockedCount,
            event_name: evt.event_name,
            provider: evt.source_provider,
            source_event_id: evt.source_event_id,
            event_date: evt.event_date,
            scheduled_lock_at: evt.scheduled_lock_at,
            server_time: nowISO,
          },
        });
        console.log(`[schedule-worker] Locked ${lockedCount} fights for event ${evt.id} (${evt.source_provider})`);
      }

      results.push({ action: "lock_fights", event_id: evt.id, ok: true });
    }

    // ── Phase 2: Mark events live at scheduled_live_at ──
    const { data: liveable } = await supabase
      .from("prediction_events")
      .select("id, event_name, scheduled_live_at, source_provider")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_live_at", "is", null)
      .lte("scheduled_live_at", now);

    for (const evt of liveable ?? []) {
      // Only mark locked fights as live (idempotent)
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

      if (liveCount > 0) {
        await supabase.from("automation_logs").insert({
          action: "schedule_live",
          event_id: evt.id,
          source: "prediction-schedule-worker",
          details: { live_fights: liveCount, event_name: evt.event_name, provider: evt.source_provider },
        });
        console.log(`[schedule-worker] Marked ${liveCount} fights live for event ${evt.id} (${evt.source_provider})`);
      }

      results.push({ action: "mark_live", event_id: evt.id, ok: true });
    }

    // ── Phase 2.5: Fallback auto-live for events past scheduled_live_at ──
    // Safety net: if event should be live but fights are still locked/open
    const { data: stuckEvents } = await supabase
      .from("prediction_events")
      .select("id, event_name, scheduled_live_at, source_provider")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_live_at", "is", null)
      .lte("scheduled_live_at", now);

    for (const evt of stuckEvents ?? []) {
      // Find fights that should be live but are still locked or open
      const { data: stuckFights, error: sfErr } = await supabase
        .from("prediction_fights")
        .update({ status: "live" })
        .eq("event_id", evt.id)
        .in("status", ["locked", "open"])
        .select("id");

      if (sfErr) {
        results.push({ action: "fallback_live", event_id: evt.id, ok: false, error: sfErr.message });
        continue;
      }

      const fallbackCount = stuckFights?.length ?? 0;
      if (fallbackCount > 0) {
        await supabase.from("automation_logs").insert({
          action: "fallback_auto_live",
          event_id: evt.id,
          source: "prediction-schedule-worker",
          details: { live_fights: fallbackCount, event_name: evt.event_name, reason: "past_scheduled_live_at_fallback", provider: evt.source_provider },
        });
        console.log(`[schedule-worker] Fallback: marked ${fallbackCount} stuck fights live for event ${evt.id}`);
        results.push({ action: "fallback_live", event_id: evt.id, ok: true });
      }
    }

    // ── Phase 3: Auto-lock events without scheduled_lock_at but with event_date passed ──
    // Fallback for events where admin approved but didn't set explicit lock time
    const { data: pastEvents } = await supabase
      .from("prediction_events")
      .select("id, event_name, event_date, source_provider")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .is("scheduled_lock_at", null)
      .not("event_date", "is", null)
      .lte("event_date", now);

    for (const evt of pastEvents ?? []) {
      const { data: fights } = await supabase
        .from("prediction_fights")
        .update({ status: "locked" })
        .eq("event_id", evt.id)
        .eq("status", "open")
        .select("id");

      const lockedCount = fights?.length ?? 0;
      if (lockedCount > 0) {
        await supabase.from("automation_logs").insert({
          action: "schedule_lock_fallback",
          event_id: evt.id,
          source: "prediction-schedule-worker",
          details: { locked_fights: lockedCount, event_name: evt.event_name, reason: "event_date_passed" },
        });
        results.push({ action: "lock_fallback", event_id: evt.id, ok: true });
      }
    }

    return json({
      processed: results.length,
      results,
    });
  } catch (err: any) {
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
