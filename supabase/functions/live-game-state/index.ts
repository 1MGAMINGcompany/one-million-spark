import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

// In-memory cache: key → { data, expiresAt }
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 15_000; // 15s for fresher live data

// Cache for market→eventId resolution (longer TTL since this doesn't change)
const eventIdCache = new Map<string, { eventId: string; expiresAt: number }>();
const EVENT_ID_TTL_MS = 300_000; // 5 min

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Resolve a market slug to its parent event ID via Gamma events endpoint.
 * The events endpoint contains live game data (score, period, live status).
 */
async function resolveEventId(slug: string): Promise<string | null> {
  const cached = eventIdCache.get(slug);
  if (cached && Date.now() < cached.expiresAt) return cached.eventId;

  try {
    const resp = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}&limit=1`);
    if (!resp.ok) return null;
    const events = await resp.json();
    if (Array.isArray(events) && events.length > 0 && events[0].id) {
      const eventId = String(events[0].id);
      eventIdCache.set(slug, { eventId, expiresAt: Date.now() + EVENT_ID_TTL_MS });
      return eventId;
    }
  } catch (e) {
    console.warn(`[live-game-state] Failed to resolve event for slug ${slug}:`, e);
  }
  return null;
}

/**
 * Fetch live game data from the Gamma EVENTS endpoint.
 * This is where score, period, live status actually live.
 */
async function fetchEventData(eventId: string): Promise<any | null> {
  try {
    const resp = await fetch(`${GAMMA_API}/events/${eventId}`);
    if (!resp.ok) {
      console.warn(`[live-game-state] Gamma event ${eventId} returned ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.warn(`[live-game-state] Error fetching event ${eventId}:`, e);
    return null;
  }
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

    // Collect uncached items
    const uncached: { key: string; slug: string; marketId?: string }[] = [];

    for (const slug of slugs) {
      const cached = cache.get(slug);
      if (cached && now < cached.expiresAt) {
        results[slug] = cached.data;
        continue;
      }
      uncached.push({ key: slug, slug, marketId: slugToMarketId[slug] });
    }

    for (const mid of marketIds) {
      const cacheKey = `mid_${mid}`;
      const cached = cache.get(cacheKey);
      if (cached && now < cached.expiresAt) {
        results[cacheKey] = cached.data;
        continue;
      }
      if (!uncached.find(x => x.marketId === mid)) {
        uncached.push({ key: cacheKey, slug: cacheKey, marketId: mid });
      }
    }

    if (uncached.length > 0) {
      // Strategy: resolve slug → eventId, then fetch event for live data
      const fetches = uncached.map(async ({ key, slug, marketId }) => {
        try {
          // Step 1: Resolve event ID from slug
          // The slug IS the event slug on Gamma (confirmed: market.slug = event.slug for sports)
          const actualSlug = slug.startsWith("mid_") ? null : slug;
          let eventId: string | null = null;

          if (actualSlug) {
            eventId = await resolveEventId(actualSlug);
          }

          // Fallback: if we have a market ID, fetch the market to get event info
          if (!eventId && marketId) {
            try {
              const mResp = await fetch(`${GAMMA_API}/markets/${marketId}`);
              if (mResp.ok) {
                const market = await mResp.json();
                // Try event slug from market, or use market slug
                const mSlug = market.slug || market.eventSlug;
                if (mSlug) {
                  eventId = await resolveEventId(mSlug);
                }
              }
            } catch {}
          }

          // Step 2: Fetch event data (which has live score/period)
          if (eventId) {
            const event = await fetchEventData(eventId);
            if (event) {
              const gameState = parseGammaEvent(event, key);
              if (gameState) {
                return { key, data: gameState };
              }
            }
          }

          // Fallback: basic market metadata
          if (marketId) {
            try {
              const resp = await fetch(`${GAMMA_API}/markets/${marketId}`);
              if (resp.ok) {
                const market = await resp.json();
                return { key, data: parseMarketFallback(market, key) };
              }
            } catch {}
          }

          return { key, data: null };
        } catch (e) {
          console.warn(`[live-game-state] Error processing ${key}:`, e);
          return { key, data: null };
        }
      });

      const fetchResults = await Promise.all(fetches);
      for (const { key, data } of fetchResults) {
        if (data) {
          cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
          results[key] = data;
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

/**
 * Parse a Gamma EVENT object for live game data.
 * The event endpoint is the ONLY source that returns score, period, live status.
 * Confirmed fields: event.score ("3-2"), event.period ("P2"), event.live (true),
 * event.gameId, event.startTime
 */
function parseGammaEvent(event: any, internalSlug: string) {
  if (!event) return null;

  const active = event.active === true;
  const closed = event.closed === true;
  const archived = event.archived === true;
  const live = event.live === true;
  const realSlug = event.slug || event.ticker || null;

  let status = "unknown";
  let ended = false;

  if (closed || archived) {
    status = "Final";
    ended = true;
  } else if (live) {
    status = "InProgress";
  } else if (active) {
    // Check if game has started based on time
    const gameStart = event.startTime
      ? new Date(event.startTime).getTime()
      : (event.endDate ? new Date(event.endDate).getTime() : 0);
    const now = Date.now();
    if (gameStart > 0 && now >= gameStart) {
      status = "InProgress";
    } else {
      status = "active";
    }
  }

  // Extract score and period directly from the event object
  let score: string | undefined;
  let scoreA: number | undefined;
  let scoreB: number | undefined;
  let period: string | undefined;
  let elapsed: string | undefined;

  if (event.score && typeof event.score === "string") {
    score = event.score;
    const parts = score.split("-").map((s: string) => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      scoreA = parts[0];
      scoreB = parts[1];
    }
  }

  if (event.period) period = String(event.period);
  if (event.elapsed) elapsed = String(event.elapsed);
  if (event.clock) elapsed = String(event.clock);

  // Detect sport from slug or title
  let sport: string | undefined;
  const slugLower = (realSlug || "").toLowerCase();
  const title = (event.title || "").toLowerCase();
  if (slugLower.startsWith("nhl-") || title.includes("nhl")) sport = "nhl";
  else if (slugLower.startsWith("nba-") || title.includes("nba")) sport = "nba";
  else if (slugLower.startsWith("mlb-") || title.includes("mlb")) sport = "mlb";
  else if (slugLower.startsWith("epl-") || slugLower.startsWith("mls-") || slugLower.startsWith("laliga-") || slugLower.startsWith("bundesliga-") || slugLower.startsWith("serie-") || slugLower.startsWith("ligue-")) sport = "soccer";
  else if (slugLower.startsWith("ufc-") || title.includes("ufc") || title.includes("boxing")) sport = "mma";

  console.log(`[live-game-state] Event ${internalSlug}: live=${live}, score=${score}, period=${period}, sport=${sport}`);

  return {
    slug: internalSlug,
    realSlug,
    eventSlug: realSlug,
    status,
    live,
    ended,
    score,
    scoreA,
    scoreB,
    period,
    elapsed,
    sport,
  };
}

/** Fallback: parse basic market metadata when event resolution fails */
function parseMarketFallback(market: any, internalSlug: string) {
  if (!market) return null;

  const active = market.active === true;
  const closed = market.closed === true;
  const resolved = market.resolved === true;
  const realSlug = market.slug || null;

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
    }
  }

  return {
    slug: internalSlug,
    realSlug,
    eventSlug: null,
    status,
    live,
    ended,
  };
}
