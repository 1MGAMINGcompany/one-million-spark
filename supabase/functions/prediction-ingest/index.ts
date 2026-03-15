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

// ── TheSportsDB league IDs (combat sports) ──
const TSDB_LEAGUES: Record<string, { id: number; sport: string }> = {
  Boxing: { id: 4443, sport: "Boxing" },
  "Top Rank": { id: 4875, sport: "Boxing" },
};

// ── API-Football league IDs (soccer – placeholder) ──
const APIFB_LEAGUES: Record<string, { id: number; sport: string }> = {
  "Premier League": { id: 39, sport: "Soccer" },
  "La Liga": { id: 140, sport: "Soccer" },
  "Champions League": { id: 2, sport: "Soccer" },
  "MLS": { id: 253, sport: "Soccer" },
};

const BDL_BASE = "https://api.balldontlie.io/mma/v1";
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const APIFB_BASE = "https://v3.football.api-sports.io";

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

async function tsdbFetch(path: string, apiKey: string): Promise<any> {
  const url = `${TSDB_BASE}/${apiKey}/${path}`;
  console.log(`[ingest] GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TheSportsDB ${res.status}: ${text}`);
  }
  return res.json();
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
    const { wallet, leagues, dry_run, provider, single_source_event_id } = body;

    // If importing a single event, force non-dry-run
    const effectiveDryRun = single_source_event_id ? false : !!dry_run;

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

    const now = new Date();

    const results = {
      providers_used: [] as string[],
      providers_skipped: [] as { provider: string; reason: string }[],
      events_found: 0,
      events_new: 0,
      events_updated: 0,
      events_skipped_dupe: 0,
      events_filtered_past: 0,
      fights_found: 0,
      fights_created: 0,
      fights_endpoint_available: false,
      errors: [] as string[],
      details: [] as any[],
    };

    // ── Determine which providers to run ──
    const runBDL = !provider || provider === "balldontlie" || provider === "all";
    const runTSDB = !provider || provider === "thesportsdb" || provider === "all";
    const runAPIFB = !provider || provider === "api-football" || provider === "all";

    // ══════════════════════════════════════════
    // PROVIDER 1: BALLDONTLIE (MMA)
    // ══════════════════════════════════════════
    if (runBDL) {
      const apiKey = Deno.env.get("BALLDONTLIE_API_KEY");
      if (!apiKey) {
        results.errors.push("BALLDONTLIE_API_KEY not configured — skipping MMA");
      } else {
        results.providers_used.push("balldontlie");
        const targetLeagues = leagues && Array.isArray(leagues) && leagues.length > 0
          ? leagues.filter((l: string) => l in BDL_LEAGUES)
          : Object.keys(BDL_LEAGUES);

        const currentYear = new Date().getFullYear();

        for (const leagueName of targetLeagues) {
          const leagueId = BDL_LEAGUES[leagueName];
          try {
            const allEvents = await bdlFetchAll("/events", apiKey, { year: String(currentYear) });
            const leagueEventsRaw = allEvents.filter((ev: any) => ev.league?.id === leagueId);
            results.events_found += leagueEventsRaw.length;

            // ── Filter to upcoming events only ──
            const leagueEvents = leagueEventsRaw
              .filter((ev: any) => {
                if (!ev.date) return true; // keep events with no date (manual review)
                const eventTime = new Date(ev.date);
                if (eventTime <= now) {
                  // Log filtered-out past event
                  const sid = `bdl_${ev.id}`;
                  console.log(`[ingest] Filtered past event: ${sid} (${ev.name || "?"}) date=${ev.date}`);
                  supabase.from("automation_logs").insert({
                    action: "past_event_filtered",
                    source: "balldontlie",
                    details: { source_event_id: sid, event_name: ev.name, event_date: ev.date, reason: "past_event_filtered" },
                    admin_wallet: wallet,
                  }).then(() => {});
                  results.events_filtered_past++;
                  return false;
                }
                return true;
              })
              .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

            for (const ev of leagueEvents) {
              const sourceEventId = `bdl_${ev.id}`;
              const eventName = ev.name || ev.short_name || "Unknown Event";
              const eventDate = ev.date || null;
              const venue = [ev.venue_name, ev.venue_city, ev.venue_state, ev.venue_country]
                .filter(Boolean)
                .join(", ");

              // ── Check existing ──
              const { data: existing } = await supabase
                .from("prediction_events")
                .select("id, event_name, status")
                .eq("source_event_id", sourceEventId)
                .maybeSingle();

              // ── Try to fetch fights ──
              let fights: any[] = [];
              let fightsError: string | null = null;
              try {
                fights = await bdlFetchAll("/fights", apiKey, { "event_ids[]": String(ev.id) });
                results.fights_endpoint_available = true;
                results.fights_found += fights.length;
              } catch (fErr: any) {
                if (fErr.message?.includes("402") || fErr.message?.includes("403") || fErr.message?.includes("401")) {
                  fightsError = "fights_endpoint_requires_paid_tier";
                } else {
                  fightsError = fErr.message;
                }
              }

              const detail: any = {
                source_event_id: sourceEventId,
                event_name: eventName,
                league: leagueName,
                sport: "MMA",
                provider: "balldontlie",
                event_date: eventDate,
                location: venue,
                fight_count: fights.length,
                fights_error: fightsError,
                action: existing ? "updated" : "created",
              };

              if (fights.length > 0) {
                detail.fights = fights.map((f: any) => ({
                  fighter1: f.fighter1?.name || "TBA",
                  fighter2: f.fighter2?.name || "TBA",
                  weight_class: f.weight_class?.name || null,
                  is_main_event: f.is_main_event || false,
                  card_segment: f.card_segment || null,
                }));
              }

              // ── Single-event filter ──
              if (single_source_event_id && sourceEventId !== single_source_event_id) {
                continue;
              }

              if (effectiveDryRun) {
                if (existing) results.events_updated++;
                else results.events_new++;
                detail.dry_run = true;
                results.details.push(detail);
                continue;
              }

              let eventId: string;

              if (existing) {
                // ── UPSERT: update metadata ──
                await supabase
                  .from("prediction_events")
                  .update({
                    event_date: eventDate,
                    location: venue || null,
                    organization: leagueName,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);

                eventId = existing.id;
                results.events_updated++;

                await supabase.from("automation_logs").insert({
                  event_id: eventId,
                  action: "event_updated",
                  source: "balldontlie",
                  details: { league: leagueName, source_event_id: sourceEventId, fights_count: fights.length },
                  admin_wallet: wallet,
                });
              } else {
              // ── INSERT new draft ──
                // MMA/combat: lock 60s before event, go live at event start
                let scheduledLockAt: string | null = null;
                let scheduledLiveAt: string | null = null;
                if (eventDate) {
                  const eventMs = new Date(eventDate).getTime();
                  scheduledLockAt = new Date(eventMs - 60_000).toISOString();
                  scheduledLiveAt = new Date(eventMs).toISOString();
                }

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
                    scheduled_lock_at: scheduledLockAt,
                    scheduled_live_at: scheduledLiveAt,
                  })
                  .select()
                  .single();

                if (insertErr) {
                  results.errors.push(`${leagueName}/${sourceEventId}: ${insertErr.message}`);
                  continue;
                }
                eventId = newEvent.id;
                results.events_new++;

                await supabase.from("automation_logs").insert({
                  event_id: eventId,
                  action: "event_discovered",
                  source: "balldontlie",
                  details: { league: leagueName, source_event_id: sourceEventId, fights_count: fights.length },
                  admin_wallet: wallet,
                });
              }

              // ── Sync fights (dedup by fighter names) ──
              if (fights.length > 0) {
                for (const fight of fights) {
                  const f1Name = normalizeName(fight.fighter1?.name || "TBA");
                  const f2Name = normalizeName(fight.fighter2?.name || "TBA");
                  if (f1Name === "Tba" && f2Name === "Tba") continue;

                  // Check if fight already exists (both orderings)
                  const { data: existingFight } = await supabase
                    .from("prediction_fights")
                    .select("id")
                    .eq("event_id", eventId)
                    .eq("fighter_a_name", f1Name)
                    .eq("fighter_b_name", f2Name)
                    .maybeSingle();

                  if (existingFight) continue;

                  const { data: existingFightRev } = await supabase
                    .from("prediction_fights")
                    .select("id")
                    .eq("event_id", eventId)
                    .eq("fighter_a_name", f2Name)
                    .eq("fighter_b_name", f1Name)
                    .maybeSingle();

                  if (existingFightRev) continue;

                  const fightTitle = `${f1Name} vs ${f2Name}`;
                  const weightClass = fight.weight_class?.name || null;

                  const { error: fightErr } = await supabase
                    .from("prediction_fights")
                    .insert({
                      title: fightTitle,
                      fighter_a_name: f1Name,
                      fighter_b_name: f2Name,
                      event_name: eventName,
                      event_id: eventId,
                      source: "balldontlie",
                      status: "open",
                      weight_class: weightClass,
                      fight_class: fight.is_main_event ? "A" : (fight.card_segment === "main_card" ? "B" : "C"),
                    });

                  if (!fightErr) results.fights_created++;
                  else results.errors.push(`Fight create: ${fightErr.message}`);
                }
              }

              detail.event_id = eventId;
              results.details.push(detail);
            }
          } catch (leagueErr) {
            const msg = leagueErr instanceof Error ? leagueErr.message : String(leagueErr);
            results.errors.push(`${leagueName}: ${msg}`);
          }
        }
      }
    }

    // ══════════════════════════════════════════
    // PROVIDER 2: TheSportsDB (Boxing/Combat)
    // ══════════════════════════════════════════
    if (runTSDB) {
      const tsdbKey = Deno.env.get("THESPORTSDB_API_KEY") || "3"; // free tier key = "3"
      results.providers_used.push("thesportsdb");

      const targetTSDB = leagues && Array.isArray(leagues) && leagues.length > 0
        ? Object.entries(TSDB_LEAGUES).filter(([name]) => leagues.includes(name))
        : Object.entries(TSDB_LEAGUES);

      for (const [leagueName, { id: leagueId, sport }] of targetTSDB) {
        try {
          const data = await tsdbFetch(`eventsnextleague.php?id=${leagueId}`, tsdbKey);
          const events_raw = data?.events || [];

          // Filter to combat sports only
          const combatEventsRaw = events_raw.filter((ev: any) => {
            const s = (ev.strSport || "").toLowerCase();
            return s === "fighting" || s === "boxing" || s === "mma" || s === "muay thai";
          });

          // ── Filter to upcoming events only ──
          const combatEvents = combatEventsRaw
            .filter((ev: any) => {
              const dateStr = ev.dateEvent || ev.strTimestamp;
              if (!dateStr) return true;
              const eventTime = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00Z`);
              if (eventTime <= now) {
                const sid = `tsdb_${ev.idEvent}`;
                console.log(`[ingest] Filtered past event: ${sid} (${ev.strEvent || "?"}) date=${dateStr}`);
                supabase.from("automation_logs").insert({
                  action: "past_event_filtered",
                  source: "thesportsdb",
                  details: { source_event_id: sid, event_name: ev.strEvent, event_date: dateStr, reason: "past_event_filtered" },
                  admin_wallet: wallet,
                }).then(() => {});
                results.events_filtered_past++;
                return false;
              }
              return true;
            })
            .sort((a: any, b: any) => {
              const da = a.dateEvent || a.strTimestamp || "";
              const db = b.dateEvent || b.strTimestamp || "";
              return new Date(da).getTime() - new Date(db).getTime();
            });

          results.events_found += combatEvents.length;

          for (const ev of combatEvents) {
            const sourceEventId = `tsdb_${ev.idEvent}`;
            const eventName = ev.strEvent || "Unknown Event";
            const eventDate = ev.dateEvent || null;
            const venue = [ev.strVenue, ev.strCity, ev.strCountry].filter(Boolean).join(", ");

            const { data: existing } = await supabase
              .from("prediction_events")
              .select("id, event_name, status")
              .eq("source_event_id", sourceEventId)
              .maybeSingle();

            const detail: any = {
              source_event_id: sourceEventId,
              event_name: eventName,
              league: leagueName,
              sport,
              provider: "thesportsdb",
              event_date: eventDate,
              location: venue,
              fight_count: 0,
              action: existing ? "updated" : "created",
            };

            // ── Single-event filter ──
            if (single_source_event_id && sourceEventId !== single_source_event_id) {
              continue;
            }

            if (effectiveDryRun) {
              if (existing) results.events_updated++;
              else results.events_new++;
              detail.dry_run = true;
              results.details.push(detail);
              continue;
            }

            if (existing) {
              await supabase
                .from("prediction_events")
                .update({
                  event_date: eventDate ? `${eventDate}T00:00:00Z` : null,
                  location: venue || null,
                  organization: leagueName,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id);

              results.events_updated++;
              detail.event_id = existing.id;

              await supabase.from("automation_logs").insert({
                event_id: existing.id,
                action: "event_updated",
                source: "thesportsdb",
                details: { league: leagueName, sport, source_event_id: sourceEventId },
                admin_wallet: wallet,
              });
            } else {
              const { data: newEvent, error: insertErr } = await supabase
                .from("prediction_events")
                .insert({
                  event_name: eventName,
                  organization: leagueName,
                  event_date: eventDate ? `${eventDate}T00:00:00Z` : null,
                  location: venue || null,
                  source: "thesportsdb",
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
              detail.event_id = newEvent.id;

              // For boxing events with two names in the title, create a single fight/market
              const vsMatch = eventName.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
              if (vsMatch) {
                const f1 = normalizeName(vsMatch[1]);
                const f2 = normalizeName(vsMatch[2]);
                const { error: fightErr } = await supabase
                  .from("prediction_fights")
                  .insert({
                    title: `${f1} vs ${f2}`,
                    fighter_a_name: f1,
                    fighter_b_name: f2,
                    event_name: eventName,
                    event_id: newEvent.id,
                    source: "thesportsdb",
                    status: "open",
                  });
                if (!fightErr) {
                  results.fights_created++;
                  detail.fight_count = 1;
                }
              }

              await supabase.from("automation_logs").insert({
                event_id: newEvent.id,
                action: "event_discovered",
                source: "thesportsdb",
                details: { league: leagueName, sport, source_event_id: sourceEventId },
                admin_wallet: wallet,
              });
            }

            results.details.push(detail);
          }
        } catch (leagueErr) {
          const msg = leagueErr instanceof Error ? leagueErr.message : String(leagueErr);
          results.errors.push(`${leagueName} (TheSportsDB): ${msg}`);
        }
      }
    }

    // ══════════════════════════════════════════
    // PROVIDER 3: API-Football (Soccer)
    // ══════════════════════════════════════════
    if (runAPIFB) {
      const apifbKey = Deno.env.get("API_FOOTBALL_KEY");
      if (!apifbKey) {
        // Gracefully skip — do NOT throw
        results.providers_skipped.push({
          provider: "api-football",
          reason: "API_FOOTBALL_KEY not configured",
        });
        console.log("[ingest] API_FOOTBALL_KEY not set — skipping soccer provider");
      } else {
        results.providers_used.push("api-football");

        const targetAPIFB = leagues && Array.isArray(leagues) && leagues.length > 0
          ? Object.entries(APIFB_LEAGUES).filter(([name]) => leagues.includes(name))
          : Object.entries(APIFB_LEAGUES);

        for (const [leagueName, { id: leagueId, sport }] of targetAPIFB) {
          try {
            // Fetch next 10 fixtures for this league
            const url = `${APIFB_BASE}/fixtures?league=${leagueId}&next=10`;
            console.log(`[ingest] GET ${url}`);
            const res = await fetch(url, {
              headers: { "x-apisports-key": apifbKey },
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`API-Football ${res.status}: ${text}`);
            }
            const data = await res.json();
            const fixtures = data?.response || [];
            results.events_found += fixtures.length;

            for (const fix of fixtures) {
              const fixtureId = fix.fixture?.id;
              if (!fixtureId) continue;

              const sourceEventId = `apifb_${fixtureId}`;
              const homeTeam = fix.teams?.home?.name || "Home";
              const awayTeam = fix.teams?.away?.name || "Away";
              const eventName = `${homeTeam} vs ${awayTeam}`;
              const eventDate = fix.fixture?.date || null;
              const venue = [fix.fixture?.venue?.name, fix.fixture?.venue?.city].filter(Boolean).join(", ");

              const { data: existing } = await supabase
                .from("prediction_events")
                .select("id, event_name, status")
                .eq("source_event_id", sourceEventId)
                .maybeSingle();

              const detail: any = {
                source_event_id: sourceEventId,
                event_name: eventName,
                league: leagueName,
                sport,
                provider: "api-football",
                event_date: eventDate,
                location: venue,
                fight_count: 0,
                action: existing ? "updated" : "created",
              };

              // ── Single-event filter ──
              if (single_source_event_id && sourceEventId !== single_source_event_id) {
                continue;
              }

              if (effectiveDryRun) {
                if (existing) results.events_updated++;
                else results.events_new++;
                detail.dry_run = true;
                results.details.push(detail);
                continue;
              }

              if (existing) {
                await supabase
                  .from("prediction_events")
                  .update({
                    event_date: eventDate,
                    location: venue || null,
                    organization: leagueName,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);

                results.events_updated++;
                detail.event_id = existing.id;

                await supabase.from("automation_logs").insert({
                  event_id: existing.id,
                  action: "event_updated",
                  source: "api-football",
                  details: { league: leagueName, sport, source_event_id: sourceEventId },
                  admin_wallet: wallet,
                });
              } else {
                // Soccer: lock 5 minutes before kickoff
                let scheduledLockAt: string | null = null;
                if (eventDate) {
                  const lockDate = new Date(new Date(eventDate).getTime() - 5 * 60 * 1000);
                  scheduledLockAt = lockDate.toISOString();
                }

                const { data: newEvent, error: insertErr } = await supabase
                  .from("prediction_events")
                  .insert({
                    event_name: eventName,
                    organization: leagueName,
                    event_date: eventDate,
                    location: venue || null,
                    source: "api-football",
                    source_provider: "api-football",
                    source_event_id: sourceEventId,
                    status: "draft",
                    is_test: false,
                    auto_resolve: false,
                    automation_status: "discovered",
                    requires_admin_approval: true,
                    scheduled_lock_at: scheduledLockAt,
                  })
                  .select()
                  .single();

                if (insertErr) {
                  results.errors.push(`${leagueName}/${sourceEventId}: ${insertErr.message}`);
                  continue;
                }

                results.events_new++;
                detail.event_id = newEvent.id;

                // Soccer: 1 event = 1 market (Home vs Away)
                const { error: fightErr } = await supabase
                  .from("prediction_fights")
                  .insert({
                    title: eventName,
                    fighter_a_name: homeTeam,
                    fighter_b_name: awayTeam,
                    event_name: eventName,
                    event_id: newEvent.id,
                    source: "api-football",
                    status: "open",
                  });
                if (!fightErr) {
                  results.fights_created++;
                  detail.fight_count = 1;
                }

                await supabase.from("automation_logs").insert({
                  event_id: newEvent.id,
                  action: "event_discovered",
                  source: "api-football",
                  details: { league: leagueName, sport, source_event_id: sourceEventId, fixture_id: fixtureId },
                  admin_wallet: wallet,
                });
              }

              results.details.push(detail);
            }
          } catch (leagueErr) {
            const msg = leagueErr instanceof Error ? leagueErr.message : String(leagueErr);
            results.errors.push(`${leagueName} (API-Football): ${msg}`);
          }
        }
      }
    }

    // ── Log summary ──
    await supabase.from("automation_logs").insert({
      action: "ingest_completed",
      source: "prediction-ingest",
      details: {
        providers: results.providers_used,
        providers_skipped: results.providers_skipped,
        events_found: results.events_found,
        events_filtered_past: results.events_filtered_past,
        events_new: results.events_new,
        events_updated: results.events_updated,
        fights_found: results.fights_found,
        fights_created: results.fights_created,
        errors: results.errors,
        dry_run: !!effectiveDryRun,
        single_source_event_id: single_source_event_id || null,
      },
      admin_wallet: wallet,
    });

    return json({ success: true, ...results });
  } catch (err) {
    console.error("[ingest] Fatal error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
