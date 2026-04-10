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
 * IMPORTANT: Never overwrite fights that already have a winner,
 * confirmed_at, or settled_at — those are resolved and must not regress.
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
    const results: { action: string; event_id?: string; fight_id?: string; ok: boolean; error?: string }[] = [];

    console.log(`[schedule-worker] Run started at ${nowISO}`);

    // ══════════════════════════════════════════════════════════════════
    // Phase 0: SELF-HEALING — repair fights that have winner/confirmed_at
    // but got reverted to open/locked/live by previous buggy runs.
    // ══════════════════════════════════════════════════════════════════
    const { data: corruptedFights } = await supabase
      .from("prediction_fights")
      .select("id, winner, confirmed_at, settled_at, claims_open_at, status")
      .in("status", ["open", "locked", "live"])
      .or("winner.not.is.null,confirmed_at.not.is.null,settled_at.not.is.null");

    for (const f of corruptedFights ?? []) {
      let targetStatus: string;
      const claimsOpen = f.claims_open_at ? new Date(f.claims_open_at) : null;

      if (f.settled_at) {
        targetStatus = "settled";
      } else if (claimsOpen && claimsOpen.getTime() <= now.getTime()) {
        // Claims window already passed — mark as confirmed so auto-settle picks it up
        targetStatus = "confirmed";
      } else if (f.winner || f.confirmed_at) {
        targetStatus = "confirmed";
      } else {
        continue;
      }

      console.log(`[schedule-worker] REPAIR: fight ${f.id} status=${f.status} → ${targetStatus} (winner=${f.winner})`);
      await supabase.from("prediction_fights")
        .update({ status: targetStatus })
        .eq("id", f.id);

      await supabase.from("automation_logs").insert({
        action: "self_heal_status",
        fight_id: f.id,
        source: "prediction-schedule-worker",
        details: {
          from_status: f.status,
          to_status: targetStatus,
          winner: f.winner,
          confirmed_at: f.confirmed_at,
          settled_at: f.settled_at,
          server_time: nowISO,
        },
      });
      results.push({ action: "self_heal", fight_id: f.id, ok: true });
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 1: Backfill NULL scheduled_live_at for started events
    // ══════════════════════════════════════════════════════════════════
    const { data: backfillEvents } = await supabase
      .from("prediction_events")
      .select("id, event_name, event_date, source_provider")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .is("scheduled_live_at", null)
      .not("event_date", "is", null)
      .lte("event_date", nowISO);

    for (const evt of backfillEvents ?? []) {
      const eventDateMs = new Date(evt.event_date!).getTime();
      await supabase.from("prediction_events").update({
        scheduled_live_at: evt.event_date,
        scheduled_lock_at: new Date(eventDateMs - 5 * 60_000).toISOString(),
      }).eq("id", evt.id);

      // Only transition fights that are truly unresolved
      const { data: transitioned } = await supabase
        .from("prediction_fights")
        .update({ status: "live" })
        .eq("event_id", evt.id)
        .in("status", ["locked", "open"])
        .is("winner", null)
        .is("confirmed_at", null)
        .is("settled_at", null)
        .select("id");

      const count = transitioned?.length ?? 0;
      if (count > 0) {
        await supabase.from("automation_logs").insert({
          action: "backfill_live",
          event_id: evt.id,
          source: "prediction-schedule-worker",
          details: {
            live_fights: count,
            event_name: evt.event_name,
            reason: "backfill_null_scheduled_live_at",
            provider: evt.source_provider,
            server_time: nowISO,
          },
        });
      }
      results.push({ action: "backfill_live", event_id: evt.id, ok: true });
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 2: Lock events at scheduled_lock_at
    // ══════════════════════════════════════════════════════════════════
    const { data: lockable } = await supabase
      .from("prediction_events")
      .select("id, event_name, event_date, scheduled_lock_at, scheduled_live_at, source_provider, source_event_id")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_lock_at", "is", null)
      .lte("scheduled_lock_at", nowISO);

    for (const evt of lockable ?? []) {
      // Only lock fights that are still open AND unresolved
      const { data: fights, error: fErr } = await supabase
        .from("prediction_fights")
        .update({ status: "locked" })
        .eq("event_id", evt.id)
        .eq("status", "open")
        .is("winner", null)
        .is("confirmed_at", null)
        .is("settled_at", null)
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
            server_time: nowISO,
          },
        });
      }
      results.push({ action: "lock_fights", event_id: evt.id, ok: true });
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 3: Mark events live at scheduled_live_at
    // ══════════════════════════════════════════════════════════════════
    const { data: liveable } = await supabase
      .from("prediction_events")
      .select("id, event_name, event_date, scheduled_live_at, source_provider, source_event_id")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_live_at", "is", null)
      .lte("scheduled_live_at", nowISO);

    for (const evt of liveable ?? []) {
      // SAFETY GUARD: Never go LIVE before event_date
      if (evt.event_date) {
        const eventStart = new Date(evt.event_date).getTime();
        if (now.getTime() < eventStart) {
          console.warn(`[schedule-worker] SAFETY BLOCK: event ${evt.id} event_date is in the future.`);
          results.push({ action: "mark_live", event_id: evt.id, ok: false, error: "safety_block_event_date_future" });
          continue;
        }
      }

      // Only mark UNRESOLVED locked fights as live
      const { data: fights, error: fErr } = await supabase
        .from("prediction_fights")
        .update({ status: "live" })
        .eq("event_id", evt.id)
        .eq("status", "locked")
        .is("winner", null)
        .is("confirmed_at", null)
        .is("settled_at", null)
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
          details: {
            live_fights: liveCount,
            event_name: evt.event_name,
            provider: evt.source_provider,
            server_time: nowISO,
          },
        });
      }
      results.push({ action: "mark_live", event_id: evt.id, ok: true });
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 3.5: Fallback auto-live for stuck events
    // Only transitions truly unresolved fights
    // ══════════════════════════════════════════════════════════════════
    const { data: stuckEvents } = await supabase
      .from("prediction_events")
      .select("id, event_name, event_date, scheduled_live_at, source_provider")
      .eq("status", "approved")
      .eq("automation_paused", false)
      .not("scheduled_live_at", "is", null)
      .lte("scheduled_live_at", nowISO);

    for (const evt of stuckEvents ?? []) {
      if (evt.event_date) {
        const eventStart = new Date(evt.event_date).getTime();
        if (now.getTime() < eventStart) continue;
      }

      const { data: stuckFights } = await supabase
        .from("prediction_fights")
        .update({ status: "live" })
        .eq("event_id", evt.id)
        .in("status", ["locked", "open"])
        .is("winner", null)
        .is("confirmed_at", null)
        .is("settled_at", null)
        .select("id");

      const fallbackCount = stuckFights?.length ?? 0;
      if (fallbackCount > 0) {
        await supabase.from("automation_logs").insert({
          action: "fallback_auto_live",
          event_id: evt.id,
          source: "prediction-schedule-worker",
          details: {
            live_fights: fallbackCount,
            event_name: evt.event_name,
            reason: "past_scheduled_live_at_fallback",
            provider: evt.source_provider,
            server_time: nowISO,
          },
        });
        results.push({ action: "fallback_live", event_id: evt.id, ok: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 4: Auto-lock events without scheduled_lock_at but event_date passed
    // ══════════════════════════════════════════════════════════════════
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
        .is("winner", null)
        .is("confirmed_at", null)
        .is("settled_at", null)
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

    // ══════════════════════════════════════════════════════════════════
    // Phase 5: Stale-live cleanup — lock fights stuck in "live" > 6h
    // ══════════════════════════════════════════════════════════════════
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const { data: staleLiveFights } = await supabase
      .from("prediction_fights")
      .select("id, event_id, event_name, event_date, status")
      .eq("status", "live")
      .is("winner", null)
      .not("event_date", "is", null)
      .lte("event_date", sixHoursAgo)
      .limit(200);

    if (staleLiveFights && staleLiveFights.length > 0) {
      for (const fight of staleLiveFights) {
        console.warn(`[STALE_CLEANUP] Locking stale live fight id=${fight.id} event=${fight.event_name}`);
        await supabase
          .from("prediction_fights")
          .update({ status: "locked" })
          .eq("id", fight.id)
          .eq("status", "live");
        await supabase.from("automation_logs").insert({
          action: "stale_live_locked",
          fight_id: fight.id,
          event_id: fight.event_id,
          source: "prediction-schedule-worker",
          details: {
            event_name: fight.event_name,
            event_date: fight.event_date,
            server_time: nowISO,
            reason: "fight stuck in live status >6h past event_date, auto-locked",
          },
        });
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
