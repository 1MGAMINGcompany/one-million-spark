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
  // Remove redundant league prefix if already in name
  if (!name.toUpperCase().includes(league.toUpperCase())) {
    name = `${league}: ${name}`;
  }
  return name;
}

function extractFighters(eventName: string): { fighterA: string; fighterB: string } | null {
  // Match "Fighter A vs Fighter B" pattern
  const vsMatch = eventName.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (!vsMatch) return null;
  return {
    fighterA: normalizeName(vsMatch[1].replace(/^.*?:\s*/, "")), // Remove prefix before colon
    fighterB: normalizeName(vsMatch[2].replace(/\s*\(.*\)$/, "")), // Remove trailing parenthetical
  };
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
      fights_created: number;
      errors: string[];
      details: any[];
    } = {
      events_found: 0,
      events_new: 0,
      events_skipped_dupe: 0,
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
          const eventName = normalizeEventName(rawEventName, leagueName, league.sport);
          const eventDate = ev.dateEvent
            ? new Date(`${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`).toISOString()
            : null;
          const venue = [ev.strVenue, ev.strCity, ev.strCountry].filter(Boolean).join(", ");

          // ── Dedupe by source_event_id ──
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
