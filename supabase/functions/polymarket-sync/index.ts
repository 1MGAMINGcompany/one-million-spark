import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";

// ── Combat search queries (search-based, unchanged) ──
const COMBAT_SEARCH_QUERIES = [
  "UFC", "boxing", "ONE Championship", "PFL", "Bellator", "bare knuckle", "MMA",
];

/** Futures / non-fixture keywords to reject for soccer events */
const FUTURES_KEYWORDS = [
  "winner", "to win", "cup winner", "league winner",
  "top scorer", "relegated", "promoted", "qualify",
  "champion", "most goals", "golden boot", "ballon d'or",
  "mvp", "best player", "transfer",
];

/** Returns true if event title looks like an actual fixture (contains "vs") */
function isActualFixture(title: string): boolean {
  const lower = title.toLowerCase();
  if (!lower.includes("vs")) return false;
  for (const kw of FUTURES_KEYWORDS) {
    if (lower.includes(kw)) return false;
  }
  return true;
}

/** Returns true if title is clearly a futures/props market (not a fixture) */
function isFuturesMarket(title: string): boolean {
  const lower = title.toLowerCase();
  for (const kw of FUTURES_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

// ── Sports Series Discovery (replaces search-based soccer queries) ──

/** Known soccer sport codes from Gamma /sports endpoint */
const SOCCER_SPORT_CODES = [
  "epl", "lal", "bun", "ser", "lig", "mls", "lgm", "ucl", "uel",
  "den", "nor", "ere", "isl", "scp", "cha", "ale", "jle", "kle",
  "spl", "bsa", "arg", "acn", "wc", "eur", "cpa",
];

/** Known combat sport codes */
const COMBAT_SPORT_CODES = ["ufc", "box", "onc", "pfl", "bkf", "mma"];

interface SportSeries {
  sport: string;
  series: string;
  label?: string;
}

/** Fetch all available sports + series IDs from Gamma /sports */
async function fetchSportsSeries(): Promise<SportSeries[]> {
  try {
    const res = await fetch(`${GAMMA_BASE}/sports`);
    if (!res.ok) {
      console.warn(`[polymarket-sync] /sports returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    // data is an array of { sport: string, series: string, ... }
    if (Array.isArray(data)) return data;
    // Sometimes wrapped in an object
    if (data?.sports && Array.isArray(data.sports)) return data.sports;
    return [];
  } catch (e) {
    console.warn(`[polymarket-sync] /sports fetch error:`, e);
    return [];
  }
}

/** Fetch events for a specific series ID */
async function fetchSeriesEvents(seriesId: string, limit = 50): Promise<GammaEvent[]> {
  try {
    const url = `${GAMMA_BASE}/events?series_id=${seriesId}&active=true&closed=false&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Search-based discovery via /public-search endpoint (fallback + combat). */
async function fetchSearchEvents(queries: string[]): Promise<GammaEvent[]> {
  const seen = new Set<string>();
  const deduped: GammaEvent[] = [];
  for (const q of queries) {
    try {
      const url = `${GAMMA_BASE}/public-search?q=${encodeURIComponent(q)}&limit=100`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const events: GammaEvent[] = data.events || [];
      for (const ev of events) {
        if (!seen.has(String(ev.id))) {
          seen.add(String(ev.id));
          deduped.push(ev);
        }
      }
    } catch {
      continue;
    }
  }
  return deduped;
}

/** Return true if event has at least one date >24h in the future. */
function isFutureEvent(ev: GammaEvent): boolean {
  const cutoff = Date.now() + 24 * 60 * 60 * 1000;
  const startMs = ev.startDate ? new Date(ev.startDate).getTime() : null;
  const endMs = ev.endDate ? new Date(ev.endDate).getTime() : null;
  if (!startMs && !endMs) return true;
  return (startMs !== null && startMs > cutoff) || (endMs !== null && endMs > cutoff);
}

/** Fetch trade volume from Data API for enrichment */
async function fetchMarketVolume(marketId: string): Promise<{ volume: number; tradeCount: number } | null> {
  try {
    const res = await fetch(`${DATA_API_BASE}/activity?market=${marketId}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      volume: parseFloat(data?.volume || "0"),
      tradeCount: parseInt(data?.tradeCount || "0", 10),
    };
  } catch {
    return null;
  }
}

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
  clobTokenIds: string;
  active: boolean;
  closed: boolean;
  endDate: string | null;
  volume: string;
  liquidity: string;
  image: string | null;
  icon: string | null;
  description: string;
  fee: string;
  groupItemTitle?: string;
  enableOrderBook: boolean;
}

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  markets: GammaMarket[];
  tags?: { label: string; slug: string }[];
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { wallet, action = "sync", tag, limit = 200, event_slug } = body;

    // ── Admin verification ──
    if (wallet) {
      const { data: admin } = await supabase
        .from("prediction_admins")
        .select("wallet")
        .eq("wallet", wallet)
        .single();
      if (!admin) return json({ error: "Unauthorized" }, 403);
    }

    // ══════════════════════════════════════════════════
    // ACTION: browse_sports — List available sports/series from Gamma
    // ══════════════════════════════════════════════════
    if (action === "browse_sports") {
      const allSeries = await fetchSportsSeries();
      return json({
        sports: allSeries.map(s => ({
          sport: s.sport,
          series: s.series,
          label: s.label || s.sport,
        })),
        total: allSeries.length,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: sync — Fetch & upsert Polymarket markets
    // Uses series-based discovery for soccer, search for combat
    // ══════════════════════════════════════════════════
    if (action === "sync") {
      const tagFilter = tag || "sports";
      // Optional: sync a specific series ID directly
      const specificSeriesId = body.series_id;

      let gammaEvents: GammaEvent[] = [];
      let seriesSynced: string[] = [];
      let searchQueries: string[] = [];
      let seriesStats: Record<string, number> = {};

      // ── Series-based discovery (soccer + sports) ──
      if (specificSeriesId) {
        // Sync a single specific series
        console.log(`[polymarket-sync] Fetching specific series: ${specificSeriesId}`);
        const events = await fetchSeriesEvents(specificSeriesId, limit);
        gammaEvents.push(...events);
        seriesSynced.push(specificSeriesId);
        seriesStats[specificSeriesId] = events.length;
      } else if (tagFilter === "mma") {
        // Combat: use search-based discovery
        searchQueries = COMBAT_SEARCH_QUERIES;
        console.log(`[polymarket-sync] Search-based fetch for MMA: ${searchQueries.join(", ")}`);
        gammaEvents = await fetchSearchEvents(searchQueries);
      } else if (tagFilter === "boxing") {
        searchQueries = ["boxing", "bare knuckle"];
        console.log(`[polymarket-sync] Search-based fetch for Boxing`);
        gammaEvents = await fetchSearchEvents(searchQueries);
      } else {
        // "soccer" or "sports" — use series-based discovery
        const allSeries = await fetchSportsSeries();
        console.log(`[polymarket-sync] Found ${allSeries.length} sport series from /sports`);

        // Determine which series to fetch
        let targetCodes: string[];
        if (tagFilter === "soccer") {
          targetCodes = SOCCER_SPORT_CODES;
        } else {
          // "sports" = all sports
          targetCodes = [...SOCCER_SPORT_CODES, ...COMBAT_SPORT_CODES];
        }

        // Match available series against target codes
        const matchedSeries = allSeries.filter(s =>
          targetCodes.some(code => s.sport.toLowerCase().includes(code.toLowerCase()))
        );

        // If no series matched our codes, use ALL available series
        const seriesToFetch = matchedSeries.length > 0 ? matchedSeries : allSeries;
        console.log(`[polymarket-sync] Fetching ${seriesToFetch.length} series for "${tagFilter}"`);

        const seen = new Set<string>();
        for (const s of seriesToFetch) {
          const events = await fetchSeriesEvents(s.series, 50);
          let added = 0;
          for (const ev of events) {
            if (!seen.has(String(ev.id))) {
              seen.add(String(ev.id));
              gammaEvents.push(ev);
              added++;
            }
          }
          seriesSynced.push(s.sport);
          seriesStats[s.sport] = added;
        }

        // Also add combat search results for "sports" (all) tag
        if (tagFilter === "sports") {
          searchQueries = COMBAT_SEARCH_QUERIES;
          const combatEvents = await fetchSearchEvents(searchQueries);
          let combatAdded = 0;
          for (const ev of combatEvents) {
            if (!seen.has(String(ev.id))) {
              seen.add(String(ev.id));
              gammaEvents.push(ev);
              combatAdded++;
            }
          }
          seriesStats["combat_search"] = combatAdded;
        }
      }

      console.log(`[polymarket-sync] Raw discovery: ${gammaEvents.length} events`);

      // Filter out past events
      const beforeFilter = gammaEvents.length;
      gammaEvents = gammaEvents.filter(isFutureEvent);
      const filteredOut = beforeFilter - gammaEvents.length;
      console.log(`[polymarket-sync] ${gammaEvents.length} future events (filtered out ${filteredOut} past)`);

      // For soccer syncs, require actual fixture titles (contains "vs", no futures keywords)
      const isSoccerSync = tagFilter === "soccer" || tagFilter === "sports";
      let futuresFiltered = 0;
      if (isSoccerSync) {
        const beforeFixture = gammaEvents.length;
        gammaEvents = gammaEvents.filter(ev => {
          const lower = ev.title.toLowerCase();
          const isCombat = COMBAT_SEARCH_QUERIES.some(q => lower.includes(q.toLowerCase()));
          if (isCombat) return true;
          return isActualFixture(ev.title);
        });
        futuresFiltered = beforeFixture - gammaEvents.length;
        console.log(`[polymarket-sync] Fixture filter: kept ${gammaEvents.length}, rejected ${futuresFiltered} futures/props`);
      }

      let eventsUpserted = 0;
      let marketsUpserted = 0;
      let skipped = 0;

      for (const gEvent of gammaEvents) {
        if (!gEvent.markets || gEvent.markets.length === 0) {
          skipped++;
          continue;
        }

        // ── Upsert prediction_event ──
        const { data: existingEvent } = await supabase
          .from("prediction_events")
          .select("id, event_name, league_logo, location, organization")
          .eq("polymarket_event_id", String(gEvent.id))
          .maybeSingle();

        let eventId: string;

        if (existingEvent) {
          await supabase
            .from("prediction_events")
            .update({
              polymarket_slug: gEvent.slug,
              event_date: gEvent.startDate || gEvent.endDate || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingEvent.id);
          eventId = existingEvent.id;
        } else {
          const { data: newEvent, error: evtErr } = await supabase
            .from("prediction_events")
            .insert({
              event_name: gEvent.title,
              polymarket_event_id: String(gEvent.id),
              polymarket_slug: gEvent.slug,
              event_date: gEvent.startDate || gEvent.endDate || null,
              source: "polymarket",
              source_provider: "polymarket",
              source_event_id: `pm_${gEvent.id}`,
              status: "draft",
              auto_resolve: false,
              requires_admin_approval: true,
            })
            .select("id")
            .single();

          if (evtErr) {
            console.error(`[polymarket-sync] Event insert error: ${evtErr.message}`);
            skipped++;
            continue;
          }
          eventId = newEvent!.id;
          eventsUpserted++;
        }

        // ── Upsert markets as prediction_fights ──
        for (const market of gEvent.markets) {
          if (!market.conditionId || !market.clobTokenIds) {
            skipped++;
            continue;
          }

          let outcomes: string[];
          let outcomePrices: string[];
          let tokenIds: string[];

          try {
            outcomes = JSON.parse(market.outcomes || "[]");
            outcomePrices = JSON.parse(market.outcomePrices || "[]");
            tokenIds = JSON.parse(market.clobTokenIds || "[]");
          } catch {
            skipped++;
            continue;
          }

          if (outcomes.length < 2 || tokenIds.length < 2) {
            skipped++;
            continue;
          }

          const { data: existing } = await supabase
            .from("prediction_fights")
            .select("id, home_logo, away_logo, fight_class, weight_class")
            .eq("polymarket_market_id", market.id)
            .maybeSingle();

          const priceA = parseFloat(outcomePrices[0] || "0");
          const priceB = parseFloat(outcomePrices[1] || "0");

          if (existing) {
            await supabase
              .from("prediction_fights")
              .update({
                price_a: priceA,
                price_b: priceB,
                polymarket_active: market.active && !market.closed,
                polymarket_end_date: market.endDate || null,
                polymarket_last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            // Try Data API enrichment for volume
            let volumeUsd = parseFloat(market.volume || "0");
            try {
              const dataApiVol = await fetchMarketVolume(market.id);
              if (dataApiVol && dataApiVol.volume > volumeUsd) {
                volumeUsd = dataApiVol.volume;
              }
            } catch { /* non-fatal */ }

            const { error: fightErr } = await supabase
              .from("prediction_fights")
              .insert({
                title: market.groupItemTitle || market.question,
                fighter_a_name: outcomes[0],
                fighter_b_name: outcomes[1],
                event_name: gEvent.title,
                event_id: eventId,
                source: "polymarket",
                commission_bps: 200,
                polymarket_market_id: market.id,
                polymarket_condition_id: market.conditionId,
                polymarket_slug: market.slug,
                polymarket_outcome_a_token: tokenIds[0],
                polymarket_outcome_b_token: tokenIds[1],
                polymarket_active: market.active && !market.closed,
                polymarket_end_date: market.endDate || null,
                polymarket_question: market.question,
                polymarket_last_synced_at: new Date().toISOString(),
                polymarket_volume_usd: volumeUsd > 0 ? volumeUsd : null,
                price_a: priceA,
                price_b: priceB,
                status: "open",
              });

            if (fightErr) {
              console.error(`[polymarket-sync] Fight insert error: ${fightErr.message}`);
              skipped++;
              continue;
            }
          }
          marketsUpserted++;
        }
      }

      // ── Auto-close past events in DB ──
      const { data: expiredRows } = await supabase
        .from("prediction_fights")
        .update({ polymarket_active: false, updated_at: new Date().toISOString() })
        .lt("polymarket_end_date", new Date().toISOString())
        .eq("status", "open")
        .not("polymarket_end_date", "is", null)
        .select("id");
      const expiredCount = expiredRows?.length ?? 0;
      if (expiredCount > 0) {
        console.log(`[polymarket-sync] Auto-closed ${expiredCount} past fights (polymarket_end_date)`);
      }

      // Immediate cleanup: any event_date in the past → cancel open fights
      const cutoffNow = new Date().toISOString();
      const { data: staleEvents } = await supabase
        .from("prediction_events")
        .select("id")
        .lt("event_date", cutoffNow)
        .not("event_date", "is", null);
      const staleEventIds = (staleEvents || []).map(e => e.id);
      let staleFightsClosedCount = 0;
      if (staleEventIds.length > 0) {
        const { data: staleFights } = await supabase
          .from("prediction_fights")
          .update({ status: "cancelled", polymarket_active: false, updated_at: new Date().toISOString() })
          .in("event_id", staleEventIds)
          .eq("status", "open")
          .select("id");
        staleFightsClosedCount = staleFights?.length ?? 0;
        if (staleFightsClosedCount > 0) {
          console.log(`[polymarket-sync] Auto-cancelled ${staleFightsClosedCount} fights from stale events`);
        }
      }

      // ── Clean up existing futures junk in DB ──
      const { data: futuresJunk } = await supabase
        .from("prediction_fights")
        .select("id, title")
        .eq("status", "open")
        .eq("source", "polymarket");
      let futuresCleanedCount = 0;
      if (futuresJunk && futuresJunk.length > 0) {
        const junkIds = futuresJunk
          .filter(f => isFuturesMarket(f.title) || !f.title.toLowerCase().includes("vs"))
          .map(f => f.id);
        if (junkIds.length > 0) {
          const { data: cleaned } = await supabase
            .from("prediction_fights")
            .update({ status: "cancelled", polymarket_active: false, updated_at: new Date().toISOString() })
            .in("id", junkIds)
            .select("id");
          futuresCleanedCount = cleaned?.length ?? 0;
          if (futuresCleanedCount > 0) {
            console.log(`[polymarket-sync] Cleaned ${futuresCleanedCount} futures/non-fixture markets from DB`);
          }
        }
      }

      // Update sync state
      await supabase
        .from("polymarket_sync_state")
        .upsert({
          id: "global",
          last_synced_at: new Date().toISOString(),
          markets_synced: marketsUpserted,
          updated_at: new Date().toISOString(),
        });

      // Audit log
      await supabase.from("automation_logs").insert({
        action: "polymarket_sync",
        source: "polymarket-sync",
        admin_wallet: wallet || null,
        details: {
          tag: tagFilter,
          discovery_method: specificSeriesId ? "specific_series" : (searchQueries.length > 0 && seriesSynced.length === 0) ? "search" : "series",
          series_synced: seriesSynced,
          series_stats: seriesStats,
          events_upserted: eventsUpserted,
          markets_upserted: marketsUpserted,
          skipped,
          expired_closed: expiredCount,
          stale_event_fights_closed: staleFightsClosedCount,
          futures_cleaned: futuresCleanedCount,
          futures_filtered: futuresFiltered,
          filtered_out_past: filteredOut,
          total_events: gammaEvents.length,
          search_queries: searchQueries.length > 0 ? searchQueries : undefined,
        },
      });

      return json({
        success: true,
        discovery_method: specificSeriesId ? "specific_series" : (searchQueries.length > 0 && seriesSynced.length === 0) ? "search" : "series",
        series_synced: seriesSynced,
        series_stats: seriesStats,
        events_upserted: eventsUpserted,
        markets_upserted: marketsUpserted,
        skipped,
        expired_closed: expiredCount,
        futures_cleaned: futuresCleanedCount,
        total_events: gammaEvents.length,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: refresh_prices
    // ══════════════════════════════════════════════════
    if (action === "refresh_prices") {
      const { data: pmFights } = await supabase
        .from("prediction_fights")
        .select("id, polymarket_outcome_a_token, polymarket_outcome_b_token, polymarket_market_id")
        .eq("polymarket_active", true)
        .not("polymarket_outcome_a_token", "is", null)
        .in("status", ["open", "locked", "live"]);

      if (!pmFights || pmFights.length === 0) {
        return json({ success: true, updated: 0, message: "No active Polymarket fights" });
      }

      let updated = 0;
      for (const fight of pmFights) {
        try {
          const [buyA, buyB] = await Promise.all([
            fetch(`https://clob.polymarket.com/price?token_id=${fight.polymarket_outcome_a_token}&side=BUY`).then(r => r.json()),
            fetch(`https://clob.polymarket.com/price?token_id=${fight.polymarket_outcome_b_token}&side=BUY`).then(r => r.json()),
          ]);

          const priceA = parseFloat(buyA?.price || "0");
          const priceB = parseFloat(buyB?.price || "0");

          await supabase
            .from("prediction_fights")
            .update({
              price_a: priceA,
              price_b: priceB,
              polymarket_last_synced_at: new Date().toISOString(),
            })
            .eq("id", fight.id);

          updated++;
        } catch (e) {
          console.error(`[polymarket-sync] Price update error for ${fight.id}: ${e}`);
        }
      }

      return json({ success: true, updated, total: pmFights.length });
    }

    // ══════════════════════════════════════════════════
    // ACTION: search — Search Polymarket events by query (with future-only filter)
    // Falls back to tag-based discovery when /public-search returns nothing
    // ══════════════════════════════════════════════════
    if (action === "search") {
      const { query } = body;
      if (!query) return json({ error: "Missing query" }, 400);

      // Step 1: Try /public-search
      const searchUrl = `${GAMMA_BASE}/public-search?q=${encodeURIComponent(query)}&limit=${limit}`;
      console.log(`[polymarket-sync] Search: ${searchUrl}`);
      const gammaRes = await fetch(searchUrl);
      let rawResults: GammaEvent[] = [];
      if (gammaRes.ok) {
        const searchData = await gammaRes.json();
        rawResults = searchData.events || [];
      }
      let results = rawResults.filter(isFutureEvent);
      console.log(`[polymarket-sync] Search returned ${results.length} future events (${rawResults.length - results.length} past filtered) for "${query}"`);

      // Step 2: If no results, try tag-based lookup
      if (results.length === 0) {
        const tagSlugs = buildTagVariations(query);
        console.log(`[polymarket-sync] Search fallback: trying tags [${tagSlugs.join(", ")}]`);
        for (const tagSlug of tagSlugs) {
          try {
            const tagUrl = `${GAMMA_BASE}/events?tag=${encodeURIComponent(tagSlug)}&active=true&closed=false&limit=${limit}`;
            const tagRes = await fetch(tagUrl);
            if (!tagRes.ok) continue;
            const tagData = await tagRes.json();
            const tagEvents: GammaEvent[] = Array.isArray(tagData) ? tagData : [];
            const futureTagEvents = tagEvents.filter(isFutureEvent);
            if (futureTagEvents.length > 0) {
              results = futureTagEvents;
              console.log(`[polymarket-sync] Tag fallback "${tagSlug}" found ${results.length} events`);
              break;
            }
          } catch { continue; }
        }
      }

      return json({
        results: results.map(e => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          startDate: e.startDate,
          endDate: e.endDate,
          markets: (e.markets || []).map(m => ({
            id: m.id,
            question: m.question,
            conditionId: m.conditionId,
            slug: m.slug,
            outcomes: (() => { try { return JSON.parse(m.outcomes || "[]"); } catch { return []; } })(),
            outcomePrices: (() => { try { return JSON.parse(m.outcomePrices || "[]"); } catch { return []; } })(),
            active: m.active,
            closed: m.closed,
            volume: m.volume,
          })),
        })),
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: import_single — Import a specific Polymarket event
    // ══════════════════════════════════════════════════
    if (action === "import_single") {
      const { polymarket_event_id } = body;
      if (!polymarket_event_id) return json({ error: "Missing polymarket_event_id" }, 400);

      const gammaRes = await fetch(`${GAMMA_BASE}/events/${polymarket_event_id}`);
      if (!gammaRes.ok) return json({ error: `Event not found (${gammaRes.status})` }, 404);

      const gEvent: GammaEvent = await gammaRes.json();

      let outcomes: string[], tokenIds: string[], outcomePrices: string[];

      const { data: existingEvt } = await supabase
        .from("prediction_events")
        .select("id")
        .eq("polymarket_event_id", String(gEvent.id))
        .maybeSingle();

      let eventId: string;
      if (existingEvt) {
        eventId = existingEvt.id;
      } else {
        const { data: newEvt, error } = await supabase
          .from("prediction_events")
          .insert({
            event_name: gEvent.title,
            polymarket_event_id: String(gEvent.id),
            polymarket_slug: gEvent.slug,
            event_date: gEvent.startDate || gEvent.endDate || null,
            source: "polymarket",
            source_provider: "polymarket",
            source_event_id: `pm_${gEvent.id}`,
            status: "draft",
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        eventId = newEvt!.id;
      }

      let imported = 0;
      for (const market of (gEvent.markets || [])) {
        try {
          outcomes = JSON.parse(market.outcomes || "[]");
          outcomePrices = JSON.parse(market.outcomePrices || "[]");
          tokenIds = JSON.parse(market.clobTokenIds || "[]");
        } catch { continue; }

        if (outcomes.length < 2 || tokenIds.length < 2) continue;

        const { data: existingFight } = await supabase
          .from("prediction_fights")
          .select("id")
          .eq("polymarket_market_id", market.id)
          .maybeSingle();

        if (existingFight) {
          await supabase.from("prediction_fights").update({
            price_a: parseFloat(outcomePrices[0] || "0"),
            price_b: parseFloat(outcomePrices[1] || "0"),
            polymarket_active: market.active && !market.closed,
            polymarket_last_synced_at: new Date().toISOString(),
          }).eq("id", existingFight.id);
        } else {
          await supabase.from("prediction_fights").insert({
            title: market.groupItemTitle || market.question,
            fighter_a_name: outcomes[0],
            fighter_b_name: outcomes[1],
            event_name: gEvent.title,
            event_id: eventId,
            source: "polymarket",
            commission_bps: 200,
            polymarket_market_id: market.id,
            polymarket_condition_id: market.conditionId,
            polymarket_slug: market.slug,
            polymarket_outcome_a_token: tokenIds[0],
            polymarket_outcome_b_token: tokenIds[1],
            polymarket_active: market.active && !market.closed,
            polymarket_end_date: market.endDate || null,
            polymarket_question: market.question,
            polymarket_last_synced_at: new Date().toISOString(),
            price_a: parseFloat(outcomePrices[0] || "0"),
            price_b: parseFloat(outcomePrices[1] || "0"),
            status: "open",
          });
        }
        imported++;
      }

      await supabase.from("automation_logs").insert({
        action: "polymarket_import_single",
        source: "polymarket-sync",
        admin_wallet: wallet || null,
        details: { polymarket_event_id, event_name: gEvent.title, imported },
      });

      return json({ success: true, event_id: eventId, imported });
    }

    // ══════════════════════════════════════════════════
    // ACTION: import_by_url — Import from a Polymarket URL, slug, or event ID
    // ══════════════════════════════════════════════════
    if (action === "import_by_url") {
      const { url } = body;
      if (!url || typeof url !== "string") return json({ error: "Missing url" }, 400);

      let slug = url.trim();
      slug = slug.split("?")[0].split("#")[0];
      const eventMatch = slug.match(/polymarket\.com\/event\/([^/]+)/);
      if (eventMatch) {
        slug = eventMatch[1];
      } else {
        slug = slug.replace(/^\/+|\/+$/g, "");
      }

      if (!slug) return json({ error: "Could not parse event slug from URL" }, 400);

      console.log(`[polymarket-sync] import_by_url: resolved slug="${slug}"`);

      const gammaRes = await fetch(`${GAMMA_BASE}/events?slug=${encodeURIComponent(slug)}`);
      if (!gammaRes.ok) return json({ error: `Event not found (${gammaRes.status})` }, 404);

      const gammaData = await gammaRes.json();
      const events: GammaEvent[] = Array.isArray(gammaData) ? gammaData : [gammaData];
      const gEvent = events[0];

      if (!gEvent || !gEvent.id) return json({ error: "Event not found for slug: " + slug }, 404);

      let outcomes: string[], tokenIds: string[], outcomePrices: string[];

      const { data: existingEvt } = await supabase
        .from("prediction_events")
        .select("id")
        .eq("polymarket_event_id", String(gEvent.id))
        .maybeSingle();

      let eventId: string;
      if (existingEvt) {
        eventId = existingEvt.id;
      } else {
        const { data: newEvt, error } = await supabase
          .from("prediction_events")
          .insert({
            event_name: gEvent.title,
            polymarket_event_id: String(gEvent.id),
            polymarket_slug: gEvent.slug,
            event_date: gEvent.startDate || gEvent.endDate || null,
            source: "polymarket",
            source_provider: "polymarket",
            source_event_id: `pm_${gEvent.id}`,
            status: "draft",
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        eventId = newEvt!.id;
      }

      let imported = 0;
      for (const market of (gEvent.markets || [])) {
        try {
          outcomes = JSON.parse(market.outcomes || "[]");
          outcomePrices = JSON.parse(market.outcomePrices || "[]");
          tokenIds = JSON.parse(market.clobTokenIds || "[]");
        } catch { continue; }

        if (outcomes.length < 2 || tokenIds.length < 2) continue;

        const { data: existingFight } = await supabase
          .from("prediction_fights")
          .select("id")
          .eq("polymarket_market_id", market.id)
          .maybeSingle();

        if (existingFight) {
          await supabase.from("prediction_fights").update({
            price_a: parseFloat(outcomePrices[0] || "0"),
            price_b: parseFloat(outcomePrices[1] || "0"),
            polymarket_active: market.active && !market.closed,
            polymarket_last_synced_at: new Date().toISOString(),
          }).eq("id", existingFight.id);
        } else {
          await supabase.from("prediction_fights").insert({
            title: market.groupItemTitle || market.question,
            fighter_a_name: outcomes[0],
            fighter_b_name: outcomes[1],
            event_name: gEvent.title,
            event_id: eventId,
            source: "polymarket",
            commission_bps: 200,
            polymarket_market_id: market.id,
            polymarket_condition_id: market.conditionId,
            polymarket_slug: market.slug,
            polymarket_outcome_a_token: tokenIds[0],
            polymarket_outcome_b_token: tokenIds[1],
            polymarket_active: market.active && !market.closed,
            polymarket_end_date: market.endDate || null,
            polymarket_question: market.question,
            polymarket_last_synced_at: new Date().toISOString(),
            price_a: parseFloat(outcomePrices[0] || "0"),
            price_b: parseFloat(outcomePrices[1] || "0"),
            status: "open",
          });
        }
        imported++;
      }

      await supabase.from("automation_logs").insert({
        action: "polymarket_import_by_url",
        source: "polymarket-sync",
        admin_wallet: wallet || null,
        details: { url, slug, event_name: gEvent.title, imported },
      });

      return json({ success: true, event_id: eventId, event_name: gEvent.title, imported, slug });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(`[polymarket-sync] Error: ${err}`);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
