import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FEED_LIMIT = 200;
const FEED_CACHE_TTL_MS = 15_000;
const FEED_QUERY_TIMEOUT_MS = 25_000;

type FeedRow = {
  id: string;
  fight_id: string;
  wallet: string | null;
  fighter_pick: string;
  amount_usd: number | null;
  amount_lamports: number | null;
  created_at: string;
};

let cachedFeed: Array<FeedRow & { wallet_short: string; amount_usd: number }> = [];
let cachedFeedAt = 0;

function buildFeed(rows: FeedRow[]) {
  return rows.map((e) => ({
    ...e,
    amount_usd:
      e.amount_usd != null && Number(e.amount_usd) > 0
        ? Number(e.amount_usd)
        : Number(e.amount_lamports || 0) / 1_000_000_000,
    wallet_short: e.wallet ? `${e.wallet.slice(0, 4)}...${e.wallet.slice(-4)}` : "anon",
  }));
}

async function fetchRecentFeed(supabaseUrl: string, serviceRoleKey: string, fightId: string | null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FEED_QUERY_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      select: "id,fight_id,wallet,fighter_pick,amount_usd,amount_lamports,created_at",
      order: "created_at.desc",
      limit: String(FEED_LIMIT),
    });

    if (fightId) {
      params.set("fight_id", `eq.${fightId}`);
    }

    const sevenDaysAgo = new Date(Date.now() - 86400000 * 7).toISOString();
    params.set("created_at", `gte.${oneHourAgo}`);

    const response = await fetch(`${supabaseUrl}/rest/v1/prediction_entries?${params.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(body || `Feed query failed (${response.status})`);
    }

    const parsed = body ? JSON.parse(body) : [];
    return Array.isArray(parsed) ? (parsed as FeedRow[]) : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const fight_id = url.searchParams.get("fight_id");

    if (!fight_id && cachedFeed.length > 0 && Date.now() - cachedFeedAt < FEED_CACHE_TTL_MS) {
      return new Response(JSON.stringify({ feed: cachedFeed, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const rows = await fetchRecentFeed(supabaseUrl, serviceRoleKey, fight_id);
      const feed = buildFeed(rows);

      if (!fight_id) {
        cachedFeed = feed;
        cachedFeedAt = Date.now();
      }

      return new Response(JSON.stringify({ feed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (queryErr: any) {
      const fallbackFeed = fight_id ? [] : cachedFeed;
      const errorCode = queryErr?.name === "AbortError" ? "feed_timeout" : "feed_unavailable";

      return new Response(
        JSON.stringify({
          feed: fallbackFeed,
          degraded: true,
          cached: fallbackFeed.length > 0,
          error: errorCode,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
