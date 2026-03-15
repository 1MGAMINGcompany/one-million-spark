import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BDL_BASE = "https://api.balldontlie.io/mma/v1";
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const APIFB_BASE = "https://v3.football.api-sports.io";
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const BOT_CLAIMS_DELAY_MS = 3 * 60 * 1000; // 3 minutes for bot-confirmed

/**
 * prediction-result-worker
 * Cron-triggered: fetches results for live/approved events from all providers.
 *
 * Safety:
 * - Requires exact source_event_id match
 * - Records result payload and confidence
 * - Flags low-confidence for admin review
 * - Auto-confirms only high-confidence matches with 3-min claims timer
 * - Never bypasses admin safety rules
 * - Never changes claim/settlement/wallet flow
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

    // Find approved events with auto_resolve enabled, not paused, with a source
    const { data: events } = await supabase
      .from("prediction_events")
      .select("id, event_name, source_event_id, source_provider, auto_resolve, automation_paused")
      .eq("status", "approved")
      .eq("auto_resolve", true)
      .eq("automation_paused", false)
      .not("source_event_id", "is", null);

    if (!events || events.length === 0) {
      return json({ processed: 0, message: "No auto-resolve events" });
    }

    const bdlKey = Deno.env.get("BALLDONTLIE_API_KEY");
    const apifbKey = Deno.env.get("API_FOOTBALL_KEY");
    const results: { event_id: string; action: string; ok: boolean; details?: unknown }[] = [];

    for (const evt of events) {
      try {
        const provider = evt.source_provider;
        const sourceId = evt.source_event_id!;

        // ── Route to correct provider ──
        if (provider === "balldontlie") {
          if (!bdlKey) { results.push({ event_id: evt.id, action: "skip", ok: true, details: "no_bdl_key" }); continue; }
          await processBDLResults(supabase, evt, bdlKey, sourceId, results);
        } else if (provider === "thesportsdb") {
          await processTSDBResults(supabase, evt, sourceId, results);
        } else if (provider === "api-football") {
          if (!apifbKey) { results.push({ event_id: evt.id, action: "skip", ok: true, details: "no_apifb_key" }); continue; }
          await processAPIFBResults(supabase, evt, apifbKey, sourceId, results);
        } else {
          results.push({ event_id: evt.id, action: "skip", ok: true, details: `unknown_provider:${provider}` });
        }
      } catch (evtErr: any) {
        results.push({ event_id: evt.id, action: "error", ok: false, details: evtErr.message });
      }
    }

    return json({ processed: results.length, results });
  } catch (err: any) {
    console.error("[result-worker] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ══════════════════════════════════════════
// BALLDONTLIE MMA result detection
// ══════════════════════════════════════════
async function processBDLResults(
  supabase: any, evt: any, apiKey: string, sourceId: string,
  results: any[]
) {
  // sourceId = "bdl_<event_id>"
  const bdlEventId = sourceId.replace("bdl_", "");

  // Fetch fights for this event
  const url = `${BDL_BASE}/fights?event_ids[]=${bdlEventId}&per_page=100`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });

  if (!res.ok) {
    // May be paid-tier only; skip gracefully
    results.push({ event_id: evt.id, action: "fetch_fights", ok: false, details: `HTTP ${res.status}` });
    return;
  }

  const data = await res.json();
  const apiFights = data.data || [];

  if (apiFights.length === 0) {
    await updateLastCheck(supabase, evt.id);
    results.push({ event_id: evt.id, action: "check", ok: true, details: "no_fights_data" });
    return;
  }

  // Get our DB fights for this event
  const { data: dbFights } = await supabase
    .from("prediction_fights")
    .select("id, fighter_a_name, fighter_b_name, status")
    .eq("event_id", evt.id)
    .in("status", ["live", "locked"]);

  if (!dbFights || dbFights.length === 0) {
    await updateLastCheck(supabase, evt.id);
    results.push({ event_id: evt.id, action: "check", ok: true, details: "no_active_fights" });
    return;
  }

  let resolved = 0;
  let flagged = 0;

  for (const dbFight of dbFights) {
    // Match API fight by fighter names
    const matchedAPI = apiFights.find((af: any) => {
      const a1 = norm(af.fighter1?.name || "");
      const a2 = norm(af.fighter2?.name || "");
      const d1 = norm(dbFight.fighter_a_name);
      const d2 = norm(dbFight.fighter_b_name);
      return (a1 === d1 && a2 === d2) || (a1 === d2 && a2 === d1);
    });

    if (!matchedAPI) continue;

    // Check if fight has a result
    const winnerId = matchedAPI.winner_id;
    const status = (matchedAPI.status || "").toLowerCase();
    const resultMethod = matchedAPI.method || matchedAPI.result || null;

    if (!winnerId || !["completed", "finished", "final"].includes(status)) continue;

    // Determine winner side
    const winnerName = norm(
      matchedAPI.winner_id === matchedAPI.fighter1?.id
        ? matchedAPI.fighter1?.name || ""
        : matchedAPI.fighter2?.name || ""
    );
    const winner = winnerName === norm(dbFight.fighter_a_name) ? "fighter_a"
                 : winnerName === norm(dbFight.fighter_b_name) ? "fighter_b"
                 : null;

    if (!winner) {
      // Can't determine side — flag for review
      await flagForReview(supabase, evt.id, dbFight.id, "Cannot determine winner side from API data", matchedAPI);
      flagged++;
      continue;
    }

    // Compute confidence
    const confidence = computeBDLConfidence(matchedAPI);
    const payload = { winner_id: winnerId, status, method: resultMethod, fighter1: matchedAPI.fighter1, fighter2: matchedAPI.fighter2 };

    await supabase.from("prediction_events").update({
      result_detected_at: new Date().toISOString(),
      result_source_payload: payload,
      result_confidence: confidence,
      last_automation_check_at: new Date().toISOString(),
    }).eq("id", evt.id);

    if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      // Auto-confirm with 3-minute claims timer
      const now = new Date();
      const claimsOpenAt = new Date(now.getTime() + BOT_CLAIMS_DELAY_MS);

      await supabase.from("prediction_fights").update({
        status: "confirmed",
        winner,
        method: resultMethod || null,
        confirmed_at: now.toISOString(),
        resolved_at: now.toISOString(),
        claims_open_at: claimsOpenAt.toISOString(),
      }).eq("id", dbFight.id).in("status", ["live", "locked"]);

      await supabase.from("automation_logs").insert({
        action: "bot_auto_confirm",
        event_id: evt.id,
        fight_id: dbFight.id,
        source: "prediction-result-worker",
        confidence,
        details: { winner, method: resultMethod, claims_open_at: claimsOpenAt.toISOString(), provider: "balldontlie" },
      });

      resolved++;
    } else {
      await flagForReview(supabase, evt.id, dbFight.id, `Low confidence (${(confidence * 100).toFixed(0)}%)`, payload);
      flagged++;
    }
  }

  await updateLastCheck(supabase, evt.id);
  results.push({ event_id: evt.id, action: "bdl_results", ok: true, details: { resolved, flagged } });
  console.log(`[result-worker] BDL event ${evt.id}: resolved=${resolved}, flagged=${flagged}`);
}

// ══════════════════════════════════════════
// TheSportsDB result detection (existing)
// ══════════════════════════════════════════
async function processTSDBResults(supabase: any, evt: any, sourceId: string, results: any[]) {
  const tsdbId = sourceId.replace("tsdb_", "");
  const resp = await fetch(`${TSDB_BASE}/lookupevent.php?id=${tsdbId}`);
  if (!resp.ok) {
    results.push({ event_id: evt.id, action: "fetch", ok: false, details: `HTTP ${resp.status}` });
    return;
  }

  const data = await resp.json();
  const sourceEvent = data?.events?.[0];

  if (!sourceEvent || String(sourceEvent.idEvent) !== tsdbId) {
    await updateLastCheck(supabase, evt.id);
    results.push({ event_id: evt.id, action: "check", ok: true, details: "no_event_data" });
    return;
  }

  const resultStr = sourceEvent.strResult;
  const statusStr = sourceEvent.strStatus;

  if (!resultStr || statusStr !== "Match Finished") {
    await updateLastCheck(supabase, evt.id);
    results.push({ event_id: evt.id, action: "check", ok: true, details: "not_finished" });
    return;
  }

  const confidence = computeTSDBConfidence(sourceEvent);
  const payload = {
    strResult: resultStr, strStatus: statusStr,
    strHomeTeam: sourceEvent.strHomeTeam, strAwayTeam: sourceEvent.strAwayTeam,
    intHomeScore: sourceEvent.intHomeScore, intAwayScore: sourceEvent.intAwayScore,
    dateEvent: sourceEvent.dateEvent,
  };

  await supabase.from("prediction_events").update({
    result_detected_at: new Date().toISOString(),
    result_source_payload: payload,
    result_confidence: confidence,
    last_automation_check_at: new Date().toISOString(),
    result_requires_review: confidence < HIGH_CONFIDENCE_THRESHOLD,
    review_reason: confidence < HIGH_CONFIDENCE_THRESHOLD
      ? `Low confidence (${(confidence * 100).toFixed(0)}%) — requires manual review`
      : null,
  }).eq("id", evt.id);

  await supabase.from("automation_logs").insert({
    action: "result_detected",
    event_id: evt.id,
    source: "prediction-result-worker",
    confidence,
    details: payload,
  });

  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    const fightResults = await autoResolveTSDBFights(supabase, evt.id, sourceEvent);
    results.push({ event_id: evt.id, action: "auto_resolve", ok: true, details: fightResults });
  } else {
    results.push({ event_id: evt.id, action: "flagged_review", ok: true, details: { confidence } });
  }
}

// ══════════════════════════════════════════
// API-Football result detection (soccer)
// ══════════════════════════════════════════
async function processAPIFBResults(supabase: any, evt: any, apiKey: string, sourceId: string, results: any[]) {
  const fixtureId = sourceId.replace("apifb_", "");
  const url = `${APIFB_BASE}/fixtures?id=${fixtureId}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });

  if (!res.ok) {
    results.push({ event_id: evt.id, action: "fetch", ok: false, details: `HTTP ${res.status}` });
    return;
  }

  const data = await res.json();
  const fixture = data?.response?.[0];

  if (!fixture) {
    await updateLastCheck(supabase, evt.id);
    results.push({ event_id: evt.id, action: "check", ok: true, details: "no_fixture_data" });
    return;
  }

  const fixStatus = (fixture.fixture?.status?.short || "").toUpperCase();
  const isFinished = fixStatus === "FT" || fixStatus === "AET" || fixStatus === "PEN";

  if (!isFinished) {
    await updateLastCheck(supabase, evt.id);
    results.push({ event_id: evt.id, action: "check", ok: true, details: `status:${fixStatus}` });
    return;
  }

  const homeScore = fixture.goals?.home;
  const awayScore = fixture.goals?.away;
  const homeTeam = fixture.teams?.home?.name;
  const awayTeam = fixture.teams?.away?.name;

  if (homeScore == null || awayScore == null) {
    await updateLastCheck(supabase, evt.id);
    results.push({ event_id: evt.id, action: "check", ok: true, details: "no_scores" });
    return;
  }

  const confidence = 0.95; // API-Football final results are highly reliable
  const payload = { homeTeam, awayTeam, homeScore, awayScore, status: fixStatus, fixture_id: fixtureId };

  await supabase.from("prediction_events").update({
    result_detected_at: new Date().toISOString(),
    result_source_payload: payload,
    result_confidence: confidence,
    last_automation_check_at: new Date().toISOString(),
  }).eq("id", evt.id);

  // Get fights for this event
  const { data: dbFights } = await supabase
    .from("prediction_fights")
    .select("id, fighter_a_name, fighter_b_name, status")
    .eq("event_id", evt.id)
    .in("status", ["live", "locked"]);

  if (!dbFights || dbFights.length === 0) {
    results.push({ event_id: evt.id, action: "check", ok: true, details: "no_active_fights" });
    return;
  }

  let resolved = 0;

  for (const fight of dbFights) {
    // Draw handling: if equal scores, flag for review (draw markets need manual handling)
    if (homeScore === awayScore) {
      await flagForReview(supabase, evt.id, fight.id, `Draw result (${homeScore}-${awayScore})`, payload);
      continue;
    }

    // Determine winner
    const winnerTeam = homeScore > awayScore ? homeTeam : awayTeam;
    const winner = norm(winnerTeam) === norm(fight.fighter_a_name) ? "fighter_a"
                 : norm(winnerTeam) === norm(fight.fighter_b_name) ? "fighter_b"
                 : null;

    if (!winner) {
      await flagForReview(supabase, evt.id, fight.id, "Cannot match winner to fighter names", payload);
      continue;
    }

    // Auto-confirm with 3-minute safety timer
    const now = new Date();
    const claimsOpenAt = new Date(now.getTime() + BOT_CLAIMS_DELAY_MS);

    await supabase.from("prediction_fights").update({
      status: "confirmed",
      winner,
      method: `${homeScore}-${awayScore}`,
      confirmed_at: now.toISOString(),
      resolved_at: now.toISOString(),
      claims_open_at: claimsOpenAt.toISOString(),
    }).eq("id", fight.id).in("status", ["live", "locked"]);

    await supabase.from("automation_logs").insert({
      action: "bot_auto_confirm",
      event_id: evt.id,
      fight_id: fight.id,
      source: "prediction-result-worker",
      confidence,
      details: { winner, score: `${homeScore}-${awayScore}`, claims_open_at: claimsOpenAt.toISOString(), provider: "api-football" },
    });

    resolved++;
  }

  results.push({ event_id: evt.id, action: "apifb_results", ok: true, details: { resolved } });
}

// ── Shared helpers ──

async function updateLastCheck(supabase: any, eventId: string) {
  await supabase.from("prediction_events")
    .update({ last_automation_check_at: new Date().toISOString() })
    .eq("id", eventId);
}

async function flagForReview(supabase: any, eventId: string, fightId: string, reason: string, payload: any) {
  await supabase.from("prediction_fights").update({
    review_required: true,
    review_reason: reason,
  }).eq("id", fightId);

  await supabase.from("prediction_events").update({
    result_requires_review: true,
    review_reason: reason,
  }).eq("id", eventId);

  await supabase.from("automation_logs").insert({
    action: "flagged_for_review",
    event_id: eventId,
    fight_id: fightId,
    source: "prediction-result-worker",
    details: { reason, payload },
  });
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function computeBDLConfidence(fight: any): number {
  let score = 0;
  let checks = 0;

  checks++; if (fight.winner_id) score++;
  checks++; if (["completed", "finished", "final"].includes((fight.status || "").toLowerCase())) score++;
  checks++; if (fight.method || fight.result) score++;
  checks++; if (fight.fighter1?.name && fight.fighter2?.name) score++;
  checks++; if (fight.rounds != null) score++;

  return checks > 0 ? score / checks : 0;
}

function computeTSDBConfidence(evt: Record<string, unknown>): number {
  let score = 0;
  let checks = 0;

  checks++; if (evt.strResult) score++;
  checks++; if (evt.strStatus === "Match Finished") score++;
  checks++; if (evt.intHomeScore != null && evt.intAwayScore != null) score++;
  checks++; if (evt.strHomeTeam && evt.strAwayTeam) score++;
  checks++; if (evt.dateEvent) score++;

  return checks > 0 ? score / checks : 0;
}

async function autoResolveTSDBFights(supabase: any, eventId: string, sourceEvent: any) {
  const { data: fights } = await supabase
    .from("prediction_fights")
    .select("id, fighter_a_name, fighter_b_name, status")
    .eq("event_id", eventId)
    .in("status", ["live", "locked"]);

  if (!fights || fights.length === 0) return [];

  const resultStr = String(sourceEvent.strResult || "");
  const resolved: any[] = [];

  for (const fight of fights) {
    const winner = matchFightWinner(fight.fighter_a_name, fight.fighter_b_name, resultStr);

    if (winner) {
      const now = new Date();
      const claimsOpenAt = new Date(now.getTime() + BOT_CLAIMS_DELAY_MS);

      await supabase.from("prediction_fights").update({
        status: "confirmed",
        winner,
        confirmed_at: now.toISOString(),
        resolved_at: now.toISOString(),
        claims_open_at: claimsOpenAt.toISOString(),
      }).eq("id", fight.id).in("status", ["live", "locked"]);

      await supabase.from("automation_logs").insert({
        action: "bot_auto_confirm",
        event_id: eventId,
        fight_id: fight.id,
        source: "prediction-result-worker",
        details: { winner, provider: "thesportsdb", claims_open_at: claimsOpenAt.toISOString() },
      });

      resolved.push({ fight_id: fight.id, winner, matched: true });
    } else {
      resolved.push({ fight_id: fight.id, matched: false });
    }
  }

  return resolved;
}

function matchFightWinner(nameA: string, nameB: string, result: string): string | null {
  const r = norm(result);
  const a = norm(nameA);
  const b = norm(nameB);

  const winPatterns = ["def.", "defeats", "wins", "won", "ko", "tko", "submission", "decision"];

  for (const pattern of winPatterns) {
    const idxA = r.indexOf(a);
    const idxB = r.indexOf(b);
    const idxP = r.indexOf(pattern);

    if (idxA >= 0 && idxP >= 0 && idxA < idxP) return "fighter_a";
    if (idxB >= 0 && idxP >= 0 && idxB < idxP) return "fighter_b";
  }

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
