import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── BALLDONTLIE MMA league IDs ──
const BDL_LEAGUES: Record<string, number> = {
  UFC: 1,
  PFL: 2,
  Bellator: 3,
  ONE: 4,
};

const BDL_BASE = "https://api.balldontlie.io/mma/v1";

// ── Helpers ──
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[''`]/g, "'")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function bdlFetch(path: string, apiKey: string, params?: Record<string, string>) {
  const url = new URL(`${BDL_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.append(k, v);
    }
  }
  console.log(`[ingest] GET ${url.toString()}`);
  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BALLDONTLIE ${res.status}: ${text}`);
  }
  return res.json();
}

// Paginate through all results
async function bdlFetchAll(path: string, apiKey: string, params?: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  const baseParams = { ...(params || {}), per_page: "100" };

  for (let page = 0; page < 20; page++) {
    const p = { ...baseParams };
    if (cursor) p.cursor = cursor;
    const data = await bdlFetch(path, apiKey, p);
    const items = data.data || [];
    all.push(...items);
    if (!data.meta?.next_cursor || items.length === 0) break;
    cursor = String(data.meta.next_cursor);
  }
  return all;
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

    const apiKey = Deno.env.get("BALLDONTLIE_API_KEY");
    if (!apiKey) {
      return json({ error: "BALLDONTLIE_API_KEY secret not configured" }, 500);
    }

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

    // ── Determine target leagues ──
    const targetLeagues = leagues && Array.isArray(leagues) && leagues.length > 0
      ? leagues.filter((l: string) => l in BDL_LEAGUES)
      : Object.keys(BDL_LEAGUES);

    if (targetLeagues.length === 0) {
      return json({ error: "No valid leagues specified" }, 400);
    }

    const results = {
      provider: "balldontlie",
      events_found: 0,
      events_new: 0,
      events_skipped_dupe: 0,
      fights_found: 0,
      fights_created: 0,
      fights_endpoint_available: false,
      errors: [] as string[],
      details: [] as any[],
    };

    // ── Fetch current year events for each league ──
    const currentYear = new Date().getFullYear();

    for (const leagueName of targetLeagues) {
      const leagueId = BDL_LEAGUES[leagueName];

      try {
        // Step 1: Get events from BALLDONTLIE
        const allEvents = await bdlFetchAll("/events", apiKey, { year: String(currentYear) });

        // Filter to events matching this league
        const leagueEvents = allEvents.filter(
          (ev: any) => ev.league?.id === leagueId
        );

        results.events_found += leagueEvents.length;
        console.log(`[ingest] ${leagueName}: found ${leagueEvents.length} events`);

        for (const ev of leagueEvents) {
          const sourceEventId = `bdl_${ev.id}`;
          const eventName = ev.name || ev.short_name || "Unknown Event";
          const eventDate = ev.date || null;
          const venue = [ev.venue_name, ev.venue_city, ev.venue_state, ev.venue_country]
            .filter(Boolean)
            .join(", ");

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

          // ── Try to fetch full fight card ──
          let fights: any[] = [];
          let fightsError: string | null = null;
          try {
            fights = await bdlFetchAll("/fights", apiKey, { "event_ids[]": String(ev.id) });
            results.fights_endpoint_available = true;
            results.fights_found += fights.length;
          } catch (fErr: any) {
            // Fights endpoint requires ALL-STAR tier; log gracefully
            if (fErr.message?.includes("402") || fErr.message?.includes("403") || fErr.message?.includes("401")) {
              fightsError = "fights_endpoint_requires_paid_tier";
              console.log(`[ingest] Fights endpoint not available (paid tier required)`);
            } else {
              fightsError = fErr.message;
              console.log(`[ingest] Fights fetch error: ${fErr.message}`);
            }
          }

          // ── Build detail record ──
          const detail: any = {
            source_event_id: sourceEventId,
            event_name: eventName,
            league: leagueName,
            league_id: leagueId,
            event_date: eventDate,
            location: venue,
            event_status: ev.status,
            fight_count: fights.length,
            fights_error: fightsError,
          };

          if (fights.length > 0) {
            detail.fights = fights.map((f: any) => ({
              fighter1: f.fighter1?.name || "TBA",
              fighter2: f.fighter2?.name || "TBA",
              weight_class: f.weight_class?.name || null,
              is_main_event: f.is_main_event || false,
              card_segment: f.card_segment || null,
              fight_order: f.fight_order || null,
            }));
          }

          if (dry_run) {
            results.events_new++;
            detail.dry_run = true;
            results.details.push(detail);
            continue;
          }

          // ── Insert event as draft ──
          const { data: newEvent, error: insertErr } = await supabase
            .from("prediction_events")
            .insert({
              event_name: eventName,
              organization: leagueName,
              event_date: eventDate,
              location: venue || null,
              source: "balldontlie",
              source_url: `https://mma.balldontlie.io/#events`,
              source_provider: "balldontlie",
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

          // ── Create fight rows from full card ──
          if (fights.length > 0 && newEvent) {
            for (const fight of fights) {
              const f1Name = normalizeName(fight.fighter1?.name || "TBA");
              const f2Name = normalizeName(fight.fighter2?.name || "TBA");
              if (f1Name === "Tba" && f2Name === "Tba") continue;

              const fightTitle = `${f1Name} vs ${f2Name}`;
              const weightClass = fight.weight_class?.name || null;

              const { error: fightErr } = await supabase
                .from("prediction_fights")
                .insert({
                  title: fightTitle,
                  fighter_a_name: f1Name,
                  fighter_b_name: f2Name,
                  event_name: eventName,
                  event_id: newEvent.id,
                  source: "balldontlie",
                  status: "open",
                  weight_class: weightClass,
                  fight_class: fight.is_main_event ? "A" : (fight.card_segment === "main_card" ? "B" : "C"),
                });

              if (!fightErr) {
                results.fights_created++;
              } else {
                results.errors.push(`Fight create: ${fightErr.message}`);
              }
            }
          }

          // ── Log the action ──
          await supabase.from("automation_logs").insert({
            event_id: newEvent?.id || null,
            action: "event_discovered",
            source: "balldontlie",
            details: {
              league: leagueName,
              league_id: leagueId,
              raw_name: eventName,
              source_event_id: sourceEventId,
              fights_count: fights.length,
              fights_error: fightsError,
            },
            admin_wallet: wallet,
          });

          detail.event_id = newEvent?.id;
          results.details.push(detail);
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
      source: "balldontlie",
      details: {
        leagues: targetLeagues,
        events_found: results.events_found,
        events_new: results.events_new,
        events_skipped_dupe: results.events_skipped_dupe,
        fights_found: results.fights_found,
        fights_created: results.fights_created,
        fights_endpoint_available: results.fights_endpoint_available,
        errors: results.errors,
        dry_run: !!dry_run,
      },
      admin_wallet: wallet,
    });

    return json({ success: true, ...results });
  } catch (err) {
    console.error("[ingest] Fatal error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
