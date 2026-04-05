import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

// In-memory cache: slug → { data, expiresAt }
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Fetch live game state from Polymarket Gamma API for a list of slugs.
 * Returns a map of slug → game state (score, period, elapsed, status, live, ended).
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

    // Cap at 20 slugs per request
    const requestSlugs = slugs.slice(0, 20) as string[];
    const results: Record<string, unknown> = {};
    const uncachedSlugs: string[] = [];

    // Check cache first
    const now = Date.now();
    for (const slug of requestSlugs) {
      const cached = cache.get(slug);
      if (cached && now < cached.expiresAt) {
        results[slug] = cached.data;
      } else {
        uncachedSlugs.push(slug);
      }
    }

    // Fetch uncached slugs from Gamma API (batch by fetching each)
    if (uncachedSlugs.length > 0) {
      const fetches = uncachedSlugs.map(async (slug) => {
        try {
          const resp = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}&limit=1`);
          if (!resp.ok) {
            console.warn(`[live-game-state] Gamma API error for ${slug}: ${resp.status}`);
            return { slug, data: null };
          }
          const events = await resp.json();
          if (!Array.isArray(events) || events.length === 0) {
            return { slug, data: null };
          }

          const event = events[0];
          // Extract game state from event metadata
          const gameState = parseGammaEventState(event, slug);
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

function parseGammaEventState(event: any, slug: string) {
  // Gamma events have: title, slug, active, closed, markets[], startDate, endDate
  // The sports metadata may be in event.metadata or markets[0].metadata
  const active = event.active === true;
  const closed = event.closed === true;

  // Check markets for game-specific state
  const markets = event.markets || [];
  const mainMarket = markets.find((m: any) =>
    m.question?.toLowerCase()?.includes("win") ||
    m.question?.toLowerCase()?.includes("vs")
  ) || markets[0];

  // Try to extract score/period from event description or metadata
  let score: string | undefined;
  let scoreA: number | undefined;
  let scoreB: number | undefined;
  let period: string | undefined;
  let elapsed: string | undefined;
  let status = "unknown";
  let sport: string | undefined;

  // Sport from tags or category
  if (event.tags) {
    const sportTag = event.tags.find((t: any) =>
      ["nba", "nfl", "nhl", "mlb", "epl", "mls", "soccer", "basketball", "hockey",
       "baseball", "tennis", "cricket", "ufc", "boxing", "f1", "golf"].includes(
        (t.label || t.slug || "").toLowerCase()
      )
    );
    if (sportTag) sport = (sportTag.label || sportTag.slug || "").toLowerCase();
  }

  // Determine live/ended from active/closed flags and timing
  const startDate = event.startDate ? new Date(event.startDate).getTime() : null;
  const now = Date.now();
  const started = startDate ? now >= startDate : false;
  const live = active && !closed && started;
  const ended = closed;

  if (ended) status = "Final";
  else if (live) status = "InProgress";
  else if (active && !started) status = "Scheduled";

  // If event has game metadata (some Gamma events include this)
  if (event.gameData || event.game_data) {
    const gd = event.gameData || event.game_data;
    score = gd.score || undefined;
    period = gd.period || gd.quarter || gd.half || undefined;
    elapsed = gd.elapsed || gd.clock || gd.time || undefined;
    if (gd.status) status = gd.status;
    if (gd.scoreA != null) scoreA = Number(gd.scoreA);
    if (gd.scoreB != null) scoreB = Number(gd.scoreB);
  }

  return {
    slug,
    score,
    scoreA,
    scoreB,
    period,
    elapsed,
    status,
    live,
    ended,
    sport,
  };
}
