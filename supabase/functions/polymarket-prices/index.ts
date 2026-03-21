import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-prices — Lightweight price + volume refresh endpoint.
 *
 * Called by frontend polling or pg_cron to keep displayed prices fresh.
 * Fetches best BUY prices from CLOB API and volume from Gamma API (both public, no auth).
 * Also enriches soccer rows with team names/images from Gamma.
 *
 * POST body: {} (no params needed — refreshes all active Polymarket fights)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";

const SOCCER_KEYWORDS = [
  "MLS", "SOCCER", "FUTBOL", "FÚTBOL", "PREMIER LEAGUE", "LA LIGA",
  "CHAMPIONS LEAGUE", "SERIE A", "BUNDESLIGA", "LIGUE 1", "EREDIVISIE",
  "LIGA MX", "EPL", "COPA", "EURO", "FIFA", "WORLD CUP",
];

function isSoccerEvent(eventName: string): boolean {
  const upper = (eventName || "").toUpperCase();
  return SOCCER_KEYWORDS.some((k) => upper.includes(k));
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

    // Get all active Polymarket-backed fights
    const { data: fights, error } = await supabase
      .from("prediction_fights")
      .select("id, polymarket_outcome_a_token, polymarket_outcome_b_token, polymarket_condition_id, polymarket_market_id, fighter_a_photo, fighter_b_photo, home_logo, away_logo, fighter_a_name, fighter_b_name, event_name, title")
      .eq("polymarket_active", true)
      .not("polymarket_outcome_a_token", "is", null)
      .in("status", ["open", "locked", "live"]);

    if (error) throw error;
    if (!fights || fights.length === 0) {
      return json({ updated: 0 });
    }

    // Batch fetch prices + volume
    let updated = 0;
    const errors: string[] = [];

    // Process in batches of 5 to avoid overwhelming the API
    const BATCH_SIZE = 5;
    for (let i = 0; i < fights.length; i += BATCH_SIZE) {
      const batch = fights.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (fight) => {
          // Fetch prices from CLOB
          const [resA, resB] = await Promise.all([
            fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_a_token}&side=BUY`),
            fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_b_token}&side=BUY`),
          ]);

          if (!resA.ok || !resB.ok) {
            throw new Error(`HTTP ${resA.status}/${resB.status} for fight ${fight.id}`);
          }

          const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
          const priceA = parseFloat(dataA?.price || "0");
          const priceB = parseFloat(dataB?.price || "0");

          // Fetch volume from Gamma API using polymarket_market_id (numeric ID)
          let totalVolume = 0;
          let poolAUsd = 0;
          let poolBUsd = 0;
          let gammaImage: string | null = null;
          let gammaGroupTitle: string | null = null;

          if (fight.polymarket_market_id) {
            try {
              const gammaRes = await fetch(
                `${GAMMA_BASE}/markets/${fight.polymarket_market_id}`
              );
              if (gammaRes.ok) {
                const market = await gammaRes.json();
                if (market) {
                  totalVolume = parseFloat(market.volumeNum || market.volume || "0");
                  // Estimate per-side volume from total volume * probability
                  if (totalVolume > 0 && priceA > 0 && priceB > 0) {
                    poolAUsd = Math.round(totalVolume * priceA * 100) / 100;
                    poolBUsd = Math.round(totalVolume * priceB * 100) / 100;
                  }
                  // Grab image and groupItemTitle for enrichment
                  gammaImage = market.image || market.icon || null;
                  gammaGroupTitle = market.groupItemTitle || null;
                }
              }
            } catch (e) {
              console.warn(`[polymarket-prices] Gamma fetch failed for ${fight.id}:`, e);
            }
          }

          const updatePayload: Record<string, any> = {
            price_a: priceA,
            price_b: priceB,
            polymarket_last_synced_at: new Date().toISOString(),
          };

          // Only update volume/pool if we got data
          if (totalVolume > 0) {
            updatePayload.polymarket_volume_usd = totalVolume;
            updatePayload.pool_a_usd = poolAUsd;
            updatePayload.pool_b_usd = poolBUsd;
          }

          // Enrich image: for soccer events, set home_logo; for others, set fighter_a_photo
          if (gammaImage) {
            const eventIsSoccer = isSoccerEvent(fight.event_name || "");
            if (eventIsSoccer && !fight.home_logo) {
              updatePayload.home_logo = gammaImage;
            } else if (!eventIsSoccer && !fight.fighter_a_photo) {
              updatePayload.fighter_a_photo = gammaImage;
            }
          }

          await supabase
            .from("prediction_fights")
            .update(updatePayload)
            .eq("id", fight.id);

          return { id: fight.id, priceA, priceB, totalVolume };
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          updated++;
        } else {
          errors.push(r.reason?.message || "unknown");
        }
      }
    }

    return json({
      updated,
      total: fights.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
