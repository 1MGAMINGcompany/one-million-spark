import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";

/** Futures / non-fixture keywords to reject */
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
  if (lower.includes("- more markets")) return false;
  if (lower.includes("winning method")) return false;
  return true;
}

/**
 * Return true if the event's match/start date is in the future.
 */
function isFutureEvent(ev: GammaEvent): boolean {
  const now = Date.now();
  const startMs = ev.startDate ? new Date(ev.startDate).getTime() : null;
  const endMs = ev.endDate ? new Date(ev.endDate).getTime() : null;
  if (startMs !== null) return startMs > now;
  if (endMs !== null) return endMs > now;
  return true;
}

/** Search-based discovery via /public-search endpoint. */
async function fetchSearchEvents(queries: string[], limit = 100): Promise<GammaEvent[]> {
  const seen = new Set<string>();
  const deduped: GammaEvent[] = [];
  for (const q of queries) {
    try {
      const url = `${GAMMA_BASE}/public-search?q=${encodeURIComponent(q)}&limit=${limit}`;
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
    const { wallet, action = "search", limit = 200 } = body;

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
    // ACTION: search — Preview-only search (no DB writes)
    // Uses /public-search, filtered for fixtures + future dates
    // ══════════════════════════════════════════════════
    if (action === "search") {
      const { query, sport_filter } = body;
      if (!query) return json({ error: "Missing query" }, 400);

      // Build search queries based on sport filter
      let searchQueries: string[] = [query];
      if (sport_filter === "soccer" && !query.toLowerCase().includes("soccer") && !query.toLowerCase().includes("football")) {
        // Append soccer context if not already in query
      }
      if (sport_filter === "mma") {
        if (!query.toLowerCase().includes("ufc") && !query.toLowerCase().includes("mma")) {
          searchQueries = [query, `${query} MMA`, `${query} UFC`];
        }
      }
      if (sport_filter === "boxing") {
        if (!query.toLowerCase().includes("boxing")) {
          searchQueries = [query, `${query} boxing`];
        }
      }

      // Fetch from /public-search
      const rawResults = await fetchSearchEvents(searchQueries, limit);

      // Filter: future events only + actual fixtures
      let results = rawResults.filter(isFutureEvent);
      const fixtureResults = results.filter(ev => isActualFixture(ev.title));
      if (fixtureResults.length > 0) {
        results = fixtureResults;
      }

      console.log(`[polymarket-sync] Search "${query}" (filter: ${sport_filter || "all"}): ${results.length} results`);

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
    // ACTION: import_single — Import a specific Polymarket event as pending_review
    // ══════════════════════════════════════════════════
    if (action === "import_single") {
      const { polymarket_event_id } = body;
      if (!polymarket_event_id) return json({ error: "Missing polymarket_event_id" }, 400);

      const gammaRes = await fetch(`${GAMMA_BASE}/events/${polymarket_event_id}`);
      if (!gammaRes.ok) return json({ error: `Event not found (${gammaRes.status})` }, 404);

      const gEvent: GammaEvent = await gammaRes.json();

      const startMs = gEvent.startDate ? new Date(gEvent.startDate).getTime() : null;
      const isPastEvent = startMs !== null && startMs < Date.now();

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
            status: "pending_review",
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        eventId = newEvt!.id;
      }

      let imported = 0;
      for (const market of (gEvent.markets || [])) {
        let outcomes: string[], tokenIds: string[], outcomePrices: string[];
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
          let volumeUsd = parseFloat(market.volume || "0");
          try {
            const dataApiVol = await fetchMarketVolume(market.id);
            if (dataApiVol && dataApiVol.volume > volumeUsd) {
              volumeUsd = dataApiVol.volume;
            }
          } catch { /* non-fatal */ }

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
            polymarket_volume_usd: volumeUsd > 0 ? volumeUsd : null,
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
        details: { polymarket_event_id, event_name: gEvent.title, imported, is_past: isPastEvent },
      });

      return json({
        success: true,
        event_id: eventId,
        imported,
        is_past: isPastEvent,
        warning: isPastEvent ? `⚠️ This event's start date (${gEvent.startDate}) is in the past.` : undefined,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: import_by_url — Import from a Polymarket URL or slug as pending_review
    // ══════════════════════════════════════════════════
    if (action === "import_by_url") {
      const { url } = body;
      if (!url || typeof url !== "string") return json({ error: "Missing url" }, 400);

      let rawUrl = url.trim();
      rawUrl = rawUrl.split("?")[0].split("#")[0];

      const eventMatch = rawUrl.match(/polymarket\.com\/event\/([^/]+)/);

      let slug: string;
      if (eventMatch) {
        slug = eventMatch[1];
      } else {
        slug = rawUrl.replace(/^\/+|\/+$/g, "");
      }

      if (!slug) return json({ error: "Could not parse event slug from URL" }, 400);

      console.log(`[polymarket-sync] import_by_url: resolved slug="${slug}"`);

      const gammaRes = await fetch(`${GAMMA_BASE}/events?slug=${encodeURIComponent(slug)}`);
      if (!gammaRes.ok) return json({ error: `Event not found (${gammaRes.status})` }, 404);

      const gammaData = await gammaRes.json();
      const events: GammaEvent[] = Array.isArray(gammaData) ? gammaData : [gammaData];
      const gEvent = events[0];

      if (!gEvent || !gEvent.id) return json({ error: "Event not found for slug: " + slug }, 404);

      const startMs = gEvent.startDate ? new Date(gEvent.startDate).getTime() : null;
      const isPastEvent = startMs !== null && startMs < Date.now();

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
            status: "pending_review",
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        eventId = newEvt!.id;
      }

      let imported = 0;
      for (const market of (gEvent.markets || [])) {
        let outcomes: string[], tokenIds: string[], outcomePrices: string[];
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
        details: { url, slug, event_name: gEvent.title, imported, is_past: isPastEvent },
      });

      return json({
        success: true,
        event_id: eventId,
        event_name: gEvent.title,
        imported,
        slug,
        is_past: isPastEvent,
        warning: isPastEvent ? `⚠️ This event's start date (${gEvent.startDate}) is in the past.` : undefined,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(`[polymarket-sync] Error: ${err}`);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
