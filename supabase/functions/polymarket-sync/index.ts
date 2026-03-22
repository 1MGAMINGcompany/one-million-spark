import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_BASE = "https://gamma-api.polymarket.com";

// ── Sports-related tags on Polymarket ──
// NOTE: "mma", "boxing", "ufc", "fighting" tags return crypto/finance events on Gamma API.
// Combat sports are discovered via SEARCH_QUERIES instead.
const SPORTS_TAGS = [
  "soccer", "mls", "epl", "la-liga", "serie-a", "bundesliga", "ligue-1", "champions-league", "liga-mx",
];

// ── Search-based discovery for combat sports (tags return wrong results) ──
const COMBAT_SEARCH_QUERIES = [
  "UFC", "boxing", "ONE Championship", "PFL", "Bellator", "bare knuckle", "MMA",
];

/** Fetch a single tag with offset-based pagination. */
async function fetchTagEvents(tag: string, limit: number): Promise<GammaEvent[]> {
  const all: GammaEvent[] = [];
  let offset = 0;
  const maxPages = 5; // safety cap
  for (let page = 0; page < maxPages; page++) {
    const url = `${GAMMA_BASE}/events?tag=${encodeURIComponent(tag)}&active=true&closed=false&limit=${limit}&offset=${offset}`;
    try {
      const res = await fetch(url);
      if (!res.ok) break;
      const batch = (await res.json()) as GammaEvent[];
      all.push(...batch);
      if (batch.length < limit) break; // no more pages
      offset += limit;
    } catch {
      break;
    }
  }
  return all;
}

/** When tag is "sports", fan out to all SPORTS_TAGS in parallel and dedupe. */
async function fetchSportsEvents(limit: number): Promise<GammaEvent[]> {
  const fetches = SPORTS_TAGS.map((t) => fetchTagEvents(t, limit));
  const arrays = await Promise.all(fetches);
  // Deduplicate by event id
  const seen = new Set<string>();
  const deduped: GammaEvent[] = [];
  for (const arr of arrays) {
    for (const ev of arr) {
      if (!seen.has(String(ev.id))) {
        seen.add(String(ev.id));
        deduped.push(ev);
      }
    }
  }
  return deduped;
}

/** Search-based discovery via /public-search endpoint. Used for combat sports. */
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

/** Return true if event endDate is in the future (or missing). */
function isFutureEvent(ev: GammaEvent): boolean {
  if (!ev.endDate) return true; // no end date = perpetual, keep it
  return new Date(ev.endDate).getTime() > Date.now();
}

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string;       // JSON string: '["Yes","No"]' or '["Team A","Team B"]'
  outcomePrices: string;  // JSON string: '["0.65","0.35"]'
  clobTokenIds: string;   // JSON string: '["token_a","token_b"]'
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
      let searchEventsCount = 0;

      if (tagFilter === "mma" || tagFilter === "boxing") {
        // Combat sports: use search-based discovery (tags return wrong results)
        console.log(`[polymarket-sync] Search-based fetch for combat sports: ${COMBAT_SEARCH_QUERIES.join(", ")}`);
        gammaEvents = await fetchSearchEvents(
          tagFilter === "boxing" ? ["boxing", "bare knuckle"] : COMBAT_SEARCH_QUERIES
        );
        searchEventsCount = gammaEvents.length;
      } else if (tagFilter === "sports") {
        // Multi-tag parallel fetch for comprehensive sports coverage
        console.log(`[polymarket-sync] Multi-tag fetch for sports (${SPORTS_TAGS.join(", ")})`);
        gammaEvents = await fetchSportsEvents(limit);

        // Also fetch combat sports via search and merge
        console.log(`[polymarket-sync] Adding combat sports via search: ${COMBAT_SEARCH_QUERIES.join(", ")}`);
        const combatEvents = await fetchSearchEvents(COMBAT_SEARCH_QUERIES);
        searchEventsCount = combatEvents.length;
        const seen = new Set(gammaEvents.map(e => String(e.id)));
        for (const ev of combatEvents) {
          if (!seen.has(String(ev.id))) {
            seen.add(String(ev.id));
            gammaEvents.push(ev);
          }
        }
        console.log(`[polymarket-sync] After combat merge: ${gammaEvents.length} total (${searchEventsCount} from search)`);
      } else {
        console.log(`[polymarket-sync] Fetching tag="${tagFilter}" with pagination, limit=${limit}`);
        gammaEvents = await fetchTagEvents(tagFilter, limit);
      }

      // Filter out past events
      const beforeFilter = gammaEvents.length;
      gammaEvents = gammaEvents.filter(isFutureEvent);
      const filteredOut = beforeFilter - gammaEvents.length;
      console.log(`[polymarket-sync] ${gammaEvents.length} future events (filtered out ${filteredOut} past)`);


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
          // Update non-enrichment fields only
          await supabase
            .from("prediction_events")
            .update({
              polymarket_slug: gEvent.slug,
              event_date: gEvent.startDate || gEvent.endDate || null,
              updated_at: new Date().toISOString(),
              // Do NOT overwrite: event_name, league_logo, location, organization (enrichment)
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

          // Check if already exists
          const { data: existing } = await supabase
            .from("prediction_fights")
            .select("id, home_logo, away_logo, fight_class, weight_class")
            .eq("polymarket_market_id", market.id)
            .maybeSingle();

          const priceA = parseFloat(outcomePrices[0] || "0");
          const priceB = parseFloat(outcomePrices[1] || "0");

          if (existing) {
            // Update prices & status only — preserve enrichment fields
            await supabase
              .from("prediction_fights")
              .update({
                price_a: priceA,
                price_b: priceB,
                polymarket_active: market.active && !market.closed,
                polymarket_end_date: market.endDate || null,
                polymarket_last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                // Do NOT overwrite: home_logo, away_logo, fight_class, weight_class (enrichment)
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
                commission_bps: 200, // 2% for imported Polymarket events
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
      // 1) Fights with polymarket_end_date in the past
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

      // 2) Fights linked to events whose event_date is >48h in the past (catches those without polymarket_end_date)
      const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: staleEvents } = await supabase
        .from("prediction_events")
        .select("id")
        .lt("event_date", cutoff48h)
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
          console.log(`[polymarket-sync] Auto-cancelled ${staleFightsClosedCount} fights from stale events (>48h past)`);
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
          filtered_out_past: filteredOut,
          total_events: gammaEvents.length,
          search_events_found: searchEventsCount,
        },
      });

      return json({
        success: true,
        events_upserted: eventsUpserted,
        markets_upserted: marketsUpserted,
        skipped,
        expired_closed: expiredCount,
        total_events: gammaEvents.length,
        search_events_found: searchEventsCount,
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: refresh_prices — Update prices for active Polymarket-backed fights
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
          // Fetch best prices from CLOB (public, no auth needed)
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
    // ACTION: search — Search Polymarket events by query
    // ══════════════════════════════════════════════════
    if (action === "search") {
      const { query } = body;
      if (!query) return json({ error: "Missing query" }, 400);

      // Use the /public-search endpoint for real keyword search
      const searchUrl = `${GAMMA_BASE}/public-search?q=${encodeURIComponent(query)}&limit=${limit}`;
      console.log(`[polymarket-sync] Search: ${searchUrl}`);
      const gammaRes = await fetch(searchUrl);
      if (!gammaRes.ok) return json({ error: `Gamma API returned ${gammaRes.status}` }, 502);

      const searchData = await gammaRes.json();
      const results: GammaEvent[] = searchData.events || [];
      console.log(`[polymarket-sync] Search returned ${results.length} events for "${query}"`);
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

      // Re-run the upsert logic for this single event (same as sync but for 1)
      const singleBody = { wallet, action: "sync", tag: "__skip__", limit: 0 };
      // Actually just inline the logic:
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
            commission_bps: 200, // 2% for imported Polymarket events
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
