import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

// In-memory cache: key → { data, expiresAt }
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const slugs = Array.isArray(body.slugs) ? body.slugs.slice(0, 30) as string[] : [];
    const marketIds = Array.isArray(body.market_ids) ? body.market_ids.slice(0, 30) as string[] : [];
    const slugToMarketId: Record<string, string> = body.slug_to_market_id || {};

    if (slugs.length === 0 && marketIds.length === 0) {
      return json({ error: "slugs or market_ids required" }, 400);
    }

    const results: Record<string, unknown> = {};
    const now = Date.now();

    const uncachedMarketIds: { internalSlug: string; marketId: string }[] = [];

    for (const internalSlug of slugs) {
      const cached = cache.get(internalSlug);
      if (cached && now < cached.expiresAt) {
        results[internalSlug] = cached.data;
        continue;
      }
      const mid = slugToMarketId[internalSlug];
      if (mid) {
        uncachedMarketIds.push({ internalSlug, marketId: mid });
      }
    }

    for (const mid of marketIds) {
      const cacheKey = `mid_${mid}`;
      const cached = cache.get(cacheKey);
      if (cached && now < cached.expiresAt) {
        results[cacheKey] = cached.data;
        continue;
      }
      if (!uncachedMarketIds.find(x => x.marketId === mid)) {
        uncachedMarketIds.push({ internalSlug: cacheKey, marketId: mid });
      }
    }

    if (uncachedMarketIds.length > 0) {
      const fetches = uncachedMarketIds.map(async ({ internalSlug, marketId }) => {
        try {
          const resp = await fetch(`${GAMMA_API}/markets/${marketId}`);
          if (!resp.ok) {
            console.warn(`[live-game-state] Gamma ${marketId} returned ${resp.status}`);
            return { internalSlug, data: null };
          }
          const market = await resp.json();
          if (!market || (!market.conditionId && !market.condition_id && !market.id)) {
            return { internalSlug, data: null };
          }
          const gameState = parseGammaMarket(market, internalSlug);
          return { internalSlug, data: gameState };
        } catch (e) {
          console.warn(`[live-game-state] Error fetching market ${marketId}:`, e);
          return { internalSlug, data: null };
        }
      });

      const fetchResults = await Promise.all(fetches);
      for (const { internalSlug, data } of fetchResults) {
        if (data) {
          cache.set(internalSlug, { data, expiresAt: now + CACHE_TTL_MS });
          results[internalSlug] = data;
        }
      }
    }

    // Cleanup old cache entries
    if (cache.size > 100) {
      for (const [k, v] of cache) {
        if (now > v.expiresAt) cache.delete(k);
      }
    }

    return json({ ok: true, games: results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[live-game-state] Error:", msg);
    return json({ error: msg }, 500);
  }
});

function parseGammaMarket(market: any, internalSlug: string) {
  if (!market) return null;

  const active = market.active === true;
  const closed = market.closed === true;
  const resolved = market.resolved === true;
  const realSlug = market.slug || null;
  const eventSlug = market.event_slug || market.eventSlug || null;

  let status = "unknown";
  let live = false;
  let ended = false;

  if (resolved || closed) {
    status = "Final";
    ended = true;
  } else if (active) {
    const gameStart = market.gameStartTime
      ? new Date(market.gameStartTime).getTime()
      : (market.startDate ? new Date(market.startDate).getTime() : 0);
    const now = Date.now();
    if (gameStart > 0 && now >= gameStart) {
      status = "InProgress";
      live = true;
    } else {
      status = "active";
      live = false;
    }
  }

  // Extract score, period, elapsed from events[0] (Gamma nests game data here)
  let score: string | undefined;
  let scoreA: number | undefined;
  let scoreB: number | undefined;
  let period: string | undefined;
  let elapsed: string | undefined;

  const event = Array.isArray(market.events) ? market.events[0] : null;
  if (event) {
    if (event.score) {
      score = event.score;
      const parts = score.split("-").map((s: string) => parseInt(s.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        scoreA = parts[0];
        scoreB = parts[1];
      }
    }
    if (event.period) period = event.period;
    if (event.elapsed) elapsed = event.elapsed;
    if (event.live === true) live = true;
    if (event.ended === true) { ended = true; status = "Final"; }
  }

  return {
    slug: internalSlug,
    realSlug,
    eventSlug,
    status,
    live,
    ended,
    score,
    scoreA,
    scoreB,
    period,
    elapsed,
  };
}
