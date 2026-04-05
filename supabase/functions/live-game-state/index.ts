import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SPORTS_API = "https://sports-api.polymarket.com";

// In-memory cache: slug → { data, expiresAt }
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 20_000; // 20s for live data freshness

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Fetch live game state from Polymarket Sports REST API.
 * Returns real scores, periods, clocks, and accurate live/ended status.
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
      // Fetch all games in one batch call if possible, otherwise individually
      const fetches = uncachedSlugs.map(async (slug) => {
        try {
          // Try the sports API games endpoint with the slug
          const resp = await fetch(
            `${SPORTS_API}/games?slug=${encodeURIComponent(slug)}`
          );
          if (!resp.ok) {
            const body = await resp.text();
            console.warn(`[live-game-state] Sports API error for ${slug}: ${resp.status} ${body}`);
            return { slug, data: null };
          }
          const games = await resp.json();

          // The response could be an array of games or a single game object
          const gameList = Array.isArray(games) ? games : games?.games || [];

          if (gameList.length === 0) {
            // Try alternate: search by market slug via /markets endpoint
            const altResp = await fetch(
              `${SPORTS_API}/markets?slug=${encodeURIComponent(slug)}`
            );
            if (altResp.ok) {
              const altData = await altResp.json();
              const altGames = Array.isArray(altData) ? altData : altData?.games || [];
              if (altGames.length > 0) {
                const gameState = parseSportsGame(altGames[0], slug);
                return { slug, data: gameState };
              }
            } else {
              await altResp.text(); // consume body
            }
            return { slug, data: null };
          }

          // Pick the most relevant game (first one, or the one that's live)
          const liveGame = gameList.find((g: any) => g.live === true) || gameList[0];
          const gameState = parseSportsGame(liveGame, slug);
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
 * Parse a game object from Polymarket's Sports REST API.
 * The API returns fields like: live, ended, score, period, clock,
 * homeScore, awayScore, quarter, half, status, sport, etc.
 */
function parseSportsGame(game: any, slug: string) {
  if (!game) return null;

  // The Sports API provides explicit live/ended booleans
  const live = game.live === true;
  const ended = game.ended === true || game.status === "Final" || game.status === "final";

  // Score extraction — try multiple field patterns
  let score: string | undefined;
  let scoreA: number | undefined;
  let scoreB: number | undefined;

  if (game.score && typeof game.score === "string") {
    score = game.score;
    const parts = score.split("-").map((s: string) => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      scoreA = parts[0];
      scoreB = parts[1];
    }
  } else if (game.homeScore != null && game.awayScore != null) {
    scoreA = Number(game.homeScore);
    scoreB = Number(game.awayScore);
    score = `${scoreA}-${scoreB}`;
  } else if (game.home_score != null && game.away_score != null) {
    scoreA = Number(game.home_score);
    scoreB = Number(game.away_score);
    score = `${scoreA}-${scoreB}`;
  }

  // Period / quarter / half
  const period = game.period || game.quarter || game.half || game.inning || undefined;

  // Elapsed / clock time
  const elapsed = game.clock || game.elapsed || game.time || game.gameClock || undefined;

  // Status
  let status = game.status || "unknown";
  if (ended) status = "Final";
  else if (live) status = "InProgress";

  // Sport detection
  const sport = game.sport || game.league || game.leagueAbbreviation || undefined;

  return {
    slug,
    score,
    scoreA,
    scoreB,
    period: period ? String(period) : undefined,
    elapsed: elapsed ? String(elapsed) : undefined,
    status,
    live,
    ended,
    sport: sport ? String(sport).toLowerCase() : undefined,
  };
}
