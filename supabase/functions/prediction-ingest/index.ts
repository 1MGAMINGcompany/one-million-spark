import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Supported sports on TheSportsDB ──
const SPORT_LEAGUES: Record<string, { id: string; sport: string }> = {
  UFC: { id: "4443", sport: "MMA" },
  Bellator: { id: "4444", sport: "MMA" },
  PFL: { id: "4445", sport: "MMA" },
  PBC: { id: "4469", sport: "BOXING" },
  TopRank: { id: "4471", sport: "BOXING" },
  Matchroom: { id: "4470", sport: "BOXING" },
};

const THESPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

// ── Known soccer / team-sport keywords (reject these) ──
const TEAM_SPORT_KEYWORDS = [
  "rovers", "united", "city", "town", "athletic", "wanderers", "albion",
  "hotspur", "orient", "wednesday", "forest", "palace", "villa", "county",
  "rangers", "celtic", "dynamo", "sporting", "olympique", "real madrid",
  "barcelona", "juventus", "bayern", "inter", "milan", "arsenal", "chelsea",
  "liverpool", "everton", "burnley", "wolves", "bournemouth", "brentford",
  "fulham", "leicester", "newcastle", "brighton", "nottingham", "luton",
  "sheffield", "blackpool", "doncaster", "peterborough", "leyton",
  "fc", "afc", "sc", "cf",
];

function looksLikeTeamName(name: string): boolean {
  const lower = name.toLowerCase();
  return TEAM_SPORT_KEYWORDS.some((kw) => lower.includes(kw));
}

function looksLikeIndividualFighter(name: string): boolean {
  // Individual fighters: typically 2-4 words, no team keywords
  const words = name.trim().split(/\s+/);
  if (words.length > 5) return false; // team names or long titles
  if (looksLikeTeamName(name)) return false;
  return true;
}

// ── Name normalization ──
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[''`]/g, "'")
    .replace(/\s+vs\.?\s+/gi, " vs ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeEventName(raw: string, league: string, sport: string): string {
  let name = normalizeName(raw);
  if (!name.toUpperCase().includes(league.toUpperCase())) {
    name = `${league}: ${name}`;
  }
  return name;
}

function extractFighters(eventName: string): { fighterA: string; fighterB: string } | null {
  const vsMatch = eventName.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (!vsMatch) return null;
  const fighterA = normalizeName(vsMatch[1].replace(/^.*?:\s*/, ""));
  const fighterB = normalizeName(vsMatch[2].replace(/\s*\(.*\)$/, ""));
  // Both must look like individual fighters, not team names
  if (!looksLikeIndividualFighter(fighterA) || !looksLikeIndividualFighter(fighterB)) {
    return null;
  }
  return { fighterA, fighterB };
}

// ── Validate event is a real combat sports event ──
function validateCombatEvent(
  ev: any,
  leagueName: string,
  expectedSport: string
): { valid: boolean; reason?: string } {
  const sport = (ev.strSport || "").toLowerCase();
  const leagueInEvent = (ev.strLeague || "").toUpperCase();
  const eventName = ev.strEvent || ev.strEventAlternate || "";

  // 1. Sport must match expected (MMA or Fighting for MMA leagues, Boxing for boxing)
  const validSports = expectedSport === "MMA"
    ? ["fighting", "mma", "mixed martial arts"]
    : ["boxing"];
  if (!validSports.some((s) => sport.includes(s)) && sport !== "") {
    return { valid: false, reason: `wrong_sport:${sport}` };
  }

  // 2. For UFC leagues, league name in event must contain "UFC"
  if (leagueName === "UFC" && !leagueInEvent.includes("UFC")) {
    return { valid: false, reason: `league_mismatch:${leagueInEvent}` };
  }

  // 3. Reject if event name contains team-sport keywords
  if (looksLikeTeamName(eventName)) {
    return { valid: false, reason: `team_name_detected:${eventName}` };
  }

  // 4. Must contain "vs" pattern with individual fighter names
  const fighters = extractFighters(eventName);
  if (!fighters) {
    return { valid: false, reason: `no_fighters_detected:${eventName}` };
  }

  return { valid: true };
}

// ── Response helper ──
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { wallet, leagues, dry_run } = body;

    // ── Admin verification ──
    if (!wallet) return json({ error: "Missing wallet" }, 400);

    const { data: admin } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", wallet)
      .single();

    if (!admin) return json({ error: "Unauthorized" }, 403);

    // ── Kill switch check ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("automation_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.automation_enabled) {
      return json({ error: "Automation is disabled by admin kill switch" }, 403);
    }

    // ── Determine which leagues to scrape ──
    const targetLeagues = leagues && Array.isArray(leagues) && leagues.length > 0
      ? leagues.filter((l: string) => l in SPORT_LEAGUES)
      : Object.keys(SPORT_LEAGUES);

    if (targetLeagues.length === 0) {
      return json({ error: "No valid leagues specified" }, 400);
    }

    const results: {
      events_found: number;
      events_new: number;
      events_skipped_dupe: number;
      events_rejected: number;
      fights_created: number;
      errors: string[];
      details: any[];
    } = {
      events_found: 0,
      events_new: 0,
      events_skipped_dupe: 0,
      events_rejected: 0,
      fights_created: 0,
      errors: [],
      details: [],
    };

    for (const leagueName of targetLeagues) {
      const league = SPORT_LEAGUES[leagueName];

      try {
        // Fetch upcoming events from TheSportsDB
        const url = `${THESPORTSDB_BASE}/eventsnextleague.php?id=${league.id}`;
        console.log(`[ingest] Fetching: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
          results.errors.push(`${leagueName}: HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();
        const events = data.events || [];
        results.events_found += events.length;

        for (const ev of events) {
          const sourceEventId = `thesportsdb_${ev.idEvent}`;
          const rawEventName = ev.strEvent || ev.strEventAlternate || "Unknown Event";

          // ── Validate this is a real combat sports event ──
          const validation = validateCombatEvent(ev, leagueName, league.sport);
          if (!validation.valid) {
            results.events_rejected++;
            console.log(`[ingest] Rejected: ${rawEventName} — ${validation.reason}`);
            // Log discarded event
            if (!dry_run) {
              await supabase.from("automation_logs").insert({
                action: "event_discarded",
                source: "thesportsdb",
                details: {
                  league: leagueName,
                  raw_name: rawEventName,
                  reason: validation.reason,
                  source_event_id: `thesportsdb_${ev.idEvent}`,
                  sport_reported: ev.strSport || "unknown",
                },
                admin_wallet: wallet,
              });
            }
            continue;
          }

          const eventName = normalizeEventName(rawEventName, leagueName, league.sport);
          const eventDate = ev.dateEvent
            ? new Date(`${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`).toISOString()
            : null;
          const venue = [ev.strVenue, ev.strCity, ev.strCountry].filter(Boolean).join(", ");

          // ── Dedupe by source_event_id ──
          // sourceEventId already declared above
          const { data: existing } = await supabase
            .from("prediction_events")
            .select("id")
            .eq("source_event_id", sourceEventId)
            .maybeSingle();

          if (existing) {
            results.events_skipped_dupe++;
            continue;
          }

          if (dry_run) {
            results.events_new++;
            results.details.push({
              source_event_id: sourceEventId,
              event_name: eventName,
              sport: league.sport,
              event_date: eventDate,
              location: venue,
              dry_run: true,
            });
            continue;
          }

          // ── Insert event as draft (never auto-published) ──
          const { data: newEvent, error: insertErr } = await supabase
            .from("prediction_events")
            .insert({
              event_name: eventName,
              organization: leagueName,
              event_date: eventDate,
              location: venue || null,
              source: "thesportsdb",
              source_url: `https://www.thesportsdb.com/event/${ev.idEvent}`,
              source_provider: "thesportsdb",
              source_event_id: sourceEventId,
              status: "draft",
              is_test: false,
              auto_resolve: false,
              automation_status: "discovered",
              requires_admin_approval: true,
            })
            .select()
            .single();

          if (insertErr) {
            results.errors.push(`${leagueName}/${sourceEventId}: ${insertErr.message}`);
            continue;
          }

          results.events_new++;

          // ── Try to extract fights from event name ──
          const fighters = extractFighters(rawEventName);
          if (fighters && newEvent) {
            const fightTitle = `${fighters.fighterA} vs ${fighters.fighterB}`;

            const { error: fightErr } = await supabase
              .from("prediction_fights")
              .insert({
                title: fightTitle,
                fighter_a_name: fighters.fighterA,
                fighter_b_name: fighters.fighterB,
                event_name: eventName,
                event_id: newEvent.id,
                source: "thesportsdb",
                status: "open",
              });

            if (!fightErr) {
              results.fights_created++;
            } else {
              results.errors.push(`Fight create: ${fightErr.message}`);
            }
          }

          // ── Log the action ──
          await supabase.from("automation_logs").insert({
            event_id: newEvent?.id || null,
            action: "event_discovered",
            source: "thesportsdb",
            details: {
              league: leagueName,
              sport: league.sport,
              raw_name: rawEventName,
              normalized_name: eventName,
              source_event_id: sourceEventId,
              fighters_extracted: !!fighters,
            },
            admin_wallet: wallet,
          });

          results.details.push({
            event_id: newEvent?.id,
            source_event_id: sourceEventId,
            event_name: eventName,
            sport: league.sport,
            fights_extracted: fighters ? 1 : 0,
          });
        }
      } catch (leagueErr) {
        const msg = leagueErr instanceof Error ? leagueErr.message : String(leagueErr);
        results.errors.push(`${leagueName}: ${msg}`);
        console.error(`[ingest] Error for ${leagueName}:`, leagueErr);
      }
    }

    // ── Log summary ──
    await supabase.from("automation_logs").insert({
      action: "ingest_completed",
      source: "thesportsdb",
      details: {
        leagues: targetLeagues,
        events_found: results.events_found,
        events_new: results.events_new,
        events_skipped_dupe: results.events_skipped_dupe,
        events_rejected: results.events_rejected,
        fights_created: results.fights_created,
        errors: results.errors,
        dry_run: !!dry_run,
      },
      admin_wallet: wallet,
    });

    return json({
      success: true,
      ...results,
    });
  } catch (err) {
    console.error("[ingest] Fatal error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
