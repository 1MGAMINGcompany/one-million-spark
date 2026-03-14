import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THESPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/**
 * prediction-result-worker
 * Cron-triggered: fetches results for live approved events from TheSportsDB.
 *
 * Safety:
 * - Requires exact source_event_id match
 * - Records result payload and confidence
 * - Flags low-confidence for admin review
 * - Auto-confirms only high-confidence exact matches
 * - Never bypasses admin safety rules
 * - Never changes claim/settlement flow
 * - Respects global + per-event automation pause
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

    // Find live events with auto_resolve + source_event_id (from TheSportsDB)
    const { data: events } = await supabase
      .from("prediction_events")
      .select("id, event_name, source_event_id, source_provider, auto_resolve, automation_paused")
      .eq("status", "approved")
      .eq("auto_resolve", true)
      .eq("automation_paused", false)
      .eq("source_provider", "thesportsdb")
      .not("source_event_id", "is", null);

    if (!events || events.length === 0) {
      return json({ processed: 0, message: "No live auto-resolve events" });
    }

    const results: { event_id: string; action: string; ok: boolean; details?: unknown }[] = [];

    for (const evt of events) {
      try {
        // Fetch event results from TheSportsDB
        const resp = await fetch(`${THESPORTSDB_BASE}/lookupevent.php?id=${evt.source_event_id}`);
        if (!resp.ok) {
          results.push({ event_id: evt.id, action: "fetch", ok: false, details: `HTTP ${resp.status}` });
          continue;
        }

        const data = await resp.json();
        const sourceEvent = data?.events?.[0];

        if (!sourceEvent) {
          results.push({ event_id: evt.id, action: "fetch", ok: true, details: "no_event_data" });
          continue;
        }

        // Require exact source_event_id match
        if (String(sourceEvent.idEvent) !== String(evt.source_event_id)) {
          results.push({ event_id: evt.id, action: "match", ok: false, details: "source_event_id_mismatch" });
          continue;
        }

        // Check if result is available
        const resultStr = sourceEvent.strResult;
        const statusStr = sourceEvent.strStatus;

        if (!resultStr || statusStr !== "Match Finished") {
          // No result yet, update last check time
          await supabase
            .from("prediction_events")
            .update({ last_automation_check_at: new Date().toISOString() })
            .eq("id", evt.id);
          results.push({ event_id: evt.id, action: "check", ok: true, details: "not_finished" });
          continue;
        }

        // ── Result detected ── Parse and score confidence ──
        const confidence = computeConfidence(sourceEvent);
        const payload = {
          strResult: resultStr,
          strStatus: statusStr,
          strHomeTeam: sourceEvent.strHomeTeam,
          strAwayTeam: sourceEvent.strAwayTeam,
          intHomeScore: sourceEvent.intHomeScore,
          intAwayScore: sourceEvent.intAwayScore,
          dateEvent: sourceEvent.dateEvent,
        };

        // Store result on event
        await supabase
          .from("prediction_events")
          .update({
            result_detected_at: new Date().toISOString(),
            result_source_payload: payload,
            result_confidence: confidence,
            last_automation_check_at: new Date().toISOString(),
            result_requires_review: confidence < HIGH_CONFIDENCE_THRESHOLD,
            review_reason: confidence < HIGH_CONFIDENCE_THRESHOLD
              ? `Low confidence (${(confidence * 100).toFixed(0)}%) — requires manual review`
              : null,
          })
          .eq("id", evt.id);

        // Log the detection
        await supabase.from("automation_logs").insert({
          action: "result_detected",
          event_id: evt.id,
          source: "prediction-result-worker",
          confidence,
          details: payload,
        });

        // ── Auto-resolve fights only if high confidence ──
        if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
          const fightResults = await autoResolveFights(supabase, evt.id, sourceEvent);

          await supabase.from("automation_logs").insert({
            action: "auto_resolve_fights",
            event_id: evt.id,
            source: "prediction-result-worker",
            confidence,
            details: { fights_resolved: fightResults },
          });

          results.push({ event_id: evt.id, action: "auto_resolve", ok: true, details: fightResults });
        } else {
          // Flag for admin review
          await supabase.from("automation_logs").insert({
            action: "flagged_for_review",
            event_id: evt.id,
            source: "prediction-result-worker",
            confidence,
            details: { reason: "below_confidence_threshold" },
          });

          results.push({ event_id: evt.id, action: "flagged_review", ok: true, details: { confidence } });
        }

        console.log(`[result-worker] Processed event ${evt.id} — confidence: ${confidence}`);
      } catch (evtErr) {
        results.push({ event_id: evt.id, action: "error", ok: false, details: evtErr.message });
      }
    }

    return json({ processed: results.length, results });
  } catch (err) {
    console.error("[result-worker] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Compute confidence score based on data completeness.
 */
function computeConfidence(evt: Record<string, unknown>): number {
  let score = 0;
  let checks = 0;

  // Has result string
  checks++;
  if (evt.strResult) score++;

  // Status is "Match Finished"
  checks++;
  if (evt.strStatus === "Match Finished") score++;

  // Has scores
  checks++;
  if (evt.intHomeScore != null && evt.intAwayScore != null) score++;

  // Has team names
  checks++;
  if (evt.strHomeTeam && evt.strAwayTeam) score++;

  // Has date
  checks++;
  if (evt.dateEvent) score++;

  return checks > 0 ? score / checks : 0;
}

/**
 * Auto-resolve fights for a high-confidence event.
 * Only moves fights from "live" → "result_selected".
 * Does NOT confirm or settle — that remains admin/auto-settle territory.
 */
async function autoResolveFights(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  sourceEvent: Record<string, unknown>
) {
  // Get all live fights for this event
  const { data: fights } = await supabase
    .from("prediction_fights")
    .select("id, fighter_a_name, fighter_b_name, status")
    .eq("event_id", eventId)
    .eq("status", "live");

  if (!fights || fights.length === 0) return [];

  const resultStr = String(sourceEvent.strResult || "");
  const resolved: { fight_id: string; winner?: string; matched: boolean }[] = [];

  for (const fight of fights) {
    // Try to match fight result from the event result string
    const winner = matchFightWinner(fight.fighter_a_name, fight.fighter_b_name, resultStr);

    if (winner) {
      // Move to result_selected (NOT confirmed — admin must confirm)
      await supabase
        .from("prediction_fights")
        .update({ status: "result_selected", winner })
        .eq("id", fight.id)
        .eq("status", "live"); // guard

      resolved.push({ fight_id: fight.id, winner, matched: true });
    } else {
      resolved.push({ fight_id: fight.id, matched: false });
    }
  }

  return resolved;
}

/**
 * Try to determine winner from result string.
 * Returns "fighter_a" | "fighter_b" | null
 */
function matchFightWinner(nameA: string, nameB: string, result: string): string | null {
  const norm = (s: string) => s.toLowerCase().trim();
  const r = norm(result);
  const a = norm(nameA);
  const b = norm(nameB);

  // Check if result contains fighter name followed by win indicators
  const winPatterns = ["def.", "defeats", "wins", "won", "ko", "tko", "submission", "decision"];

  for (const pattern of winPatterns) {
    // "Fighter A def. Fighter B" pattern
    const idxA = r.indexOf(a);
    const idxB = r.indexOf(b);
    const idxP = r.indexOf(pattern);

    if (idxA >= 0 && idxP >= 0 && idxA < idxP) return "fighter_a";
    if (idxB >= 0 && idxP >= 0 && idxB < idxP) return "fighter_b";
  }

  // Last name matching fallback
  const lastA = a.split(" ").pop() || "";
  const lastB = b.split(" ").pop() || "";

  for (const pattern of winPatterns) {
    const idxA = r.indexOf(lastA);
    const idxB = r.indexOf(lastB);
    const idxP = r.indexOf(pattern);

    if (idxA >= 0 && idxP >= 0 && idxA < idxP) return "fighter_a";
    if (idxB >= 0 && idxP >= 0 && idxB < idxP) return "fighter_b";
  }

  return null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
