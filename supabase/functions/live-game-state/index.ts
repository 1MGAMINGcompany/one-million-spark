import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Gamma API for market metadata (the REST endpoint that actually exists)
const GAMMA_API = "https://gamma-api.polymarket.com";

// In-memory cache: slug → { data, expiresAt }
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30s

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Fetch market state from Polymarket Gamma API.
 * The sports-api.polymarket.com only has WebSocket — no REST endpoint for games.
 * So we use the Gamma API to get basic market metadata (active, closed, etc.)
 * and rely on the frontend WebSocket for live scores/periods.
 *
 * This endpoint now returns market status info (is it active, resolved, etc.)
 * rather than live scores, since live scores only come via WS.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slugs } = await req.json();
    if (!Array.isArray(slugs) || slugs.length === 0) {
      return json({ error: "slugs array required" }, 400);
    }

    const requestSlugs = slugs.slice(0, 20) as string[];
    const results: Record<string, unknown> = {};
    const uncachedSlugs: string[] = [];

    const now = Date.now();
    for (const slug of requestSlugs) {
      const cached = cache.get(slug);
      if (cached && now < cached.expiresAt) {
        results[slug] = cached.data;
      } else {
        uncachedSlugs.push(slug);
      }
    }

    if (uncachedSlugs.length > 0) {
      // Fetch from Gamma API — search markets by slug
      const fetches = uncachedSlugs.map(async (slug) => {
        try {
          const resp = await fetch(
            `${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}&limit=1`
          );
          if (!resp.ok) {
            // Gamma returns 200 with empty array for no results
            await resp.text();
            return { slug, data: null };
          }
          const markets = await resp.json();
          const marketList = Array.isArray(markets) ? markets : [];

          if (marketList.length === 0) {
            return { slug, data: null };
          }

          const market = marketList[0];
          const gameState = parseGammaMarket(market, slug);
          return { slug, data: gameState };
        } catch (e) {
          console.warn(`[live-game-state] Error fetching ${slug}:`, e);
          return { slug, data: null };
        }
      });

      const fetchResults = await Promise.all(fetches);
      for (const { slug, data } of fetchResults) {
        if (data) {
          cache.set(slug, { data, expiresAt: now + CACHE_TTL_MS });
          results[slug] = data;
        }
      }
    }

    // Cleanup old cache entries
    if (cache.size > 50) {
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

/**
 * Parse a market object from Polymarket's Gamma API.
 * This gives us market status (active/resolved/closed) but NOT live scores.
 * Live scores come exclusively from the Sports WebSocket.
 */
function parseGammaMarket(market: any, slug: string) {
  if (!market) return null;

  const active = market.active === true;
  const closed = market.closed === true;
  const resolved = market.resolved === true || !!market.resolvedBy;

  // Determine status
  let status = "unknown";
  let live = false;
  let ended = false;

  if (resolved || closed) {
    status = "Final";
    ended = true;
  } else if (active) {
    // Market is active — could be pre-game or live
    // We can't know if the game is actually live from Gamma alone
    // The WS will provide that. Mark as "active" so UI knows it exists.
    status = "active";
    live = false; // WS will upgrade to live when the game actually starts
  }

  return {
    slug,
    status,
    live,
    ended,
    // No score/period/elapsed from Gamma — WS provides those
  };
}
