import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_BASE = "https://gamma-api.polymarket.com";

// ── Search-based discovery (tags are unreliable on Gamma API) ──
// Fixture-focused queries bias toward actual "Team A vs Team B" matches
const SOCCER_SEARCH_QUERIES = [
  "soccer vs", "football vs",
  "Premier League vs", "La Liga vs", "Serie A vs", "Bundesliga vs",
  "Ligue 1 vs", "MLS vs", "Liga MX vs",
  "Champions League vs", "Europa League vs",
  "Denmark Superliga vs", "Norway Eliteserien vs",
  "Eredivisie vs", "Indian Super League vs",
  "Scottish Premiership vs", "Championship vs",
];

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
  // Must contain "vs" or "vs."
  if (!lower.includes("vs")) return false;
  // Reject if it contains futures keywords
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

/** Search-based discovery via /public-search endpoint. */
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
  const cutoff = Date.now() + 24 * 60 * 60 * 1000; // 24h from now
  const startMs = ev.startDate ? new Date(ev.startDate).getTime() : null;
  const endMs = ev.endDate ? new Date(ev.endDate).getTime() : null;
  // If no dates at all, let it through (rare)
  if (!startMs && !endMs) return true;
  // At least one date must be >24h in the future
  return (startMs !== null && startMs > cutoff) || (endMs !== null && endMs > cutoff);
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
    // ACTION: sync — Fetch & upsert Polymarket markets
    // ══════════════════════════════════════════════════
    if (action === "sync") {
      const tagFilter = tag || "sports";

      let gammaEvents: GammaEvent[];
      let searchQueries: string[];

      if (tagFilter === "mma") {
        searchQueries = COMBAT_SEARCH_QUERIES;
      } else if (tagFilter === "boxing") {
        searchQueries = ["boxing", "bare knuckle"];
      } else if (tagFilter === "soccer") {
        searchQueries = SOCCER_SEARCH_QUERIES;
      } else {
        // "sports" or "All" — fetch everything
        searchQueries = [...SOCCER_SEARCH_QUERIES, ...COMBAT_SEARCH_QUERIES];
      }

      console.log(`[polymarket-sync] Search-based fetch for "${tagFilter}": ${searchQueries.join(", ")}`);
      gammaEvents = await fetchSearchEvents(searchQueries);
      console.log(`[polymarket-sync] Raw search results: ${gammaEvents.length} events`);

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
          // Combat sports events pass through (looser filter)
          const lower = ev.title.toLowerCase();
          const isCombat = COMBAT_SEARCH_QUERIES.some(q => lower.includes(q.toLowerCase()));
          if (isCombat) return true;
          // Soccer events must be actual fixtures
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
      // Cancel any open fights that look like futures markets (no "vs" in title)
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
          events_upserted: eventsUpserted,
          markets_upserted: marketsUpserted,
          skipped,
          expired_closed: expiredCount,
          stale_event_fights_closed: staleFightsClosedCount,
          futures_cleaned: futuresCleanedCount,
          futures_filtered: futuresFiltered,
          filtered_out_past: filteredOut,
          total_events: gammaEvents.length,
          search_queries: searchQueries,
        },
      });

      return json({
        success: true,
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
    // ══════════════════════════════════════════════════
    if (action === "search") {
      const { query } = body;
      if (!query) return json({ error: "Missing query" }, 400);

      const searchUrl = `${GAMMA_BASE}/public-search?q=${encodeURIComponent(query)}&limit=${limit}`;
      console.log(`[polymarket-sync] Search: ${searchUrl}`);
      const gammaRes = await fetch(searchUrl);
      if (!gammaRes.ok) return json({ error: `Gamma API returned ${gammaRes.status}` }, 502);

      const searchData = await gammaRes.json();
      const rawResults: GammaEvent[] = searchData.events || [];
      // Filter out past events so admin never sees stale results
      const results = rawResults.filter(isFutureEvent);
      console.log(`[polymarket-sync] Search returned ${results.length} future events (${rawResults.length - results.length} past filtered) for "${query}"`);
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

      // Upsert event
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

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(`[polymarket-sync] Error: ${err}`);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
