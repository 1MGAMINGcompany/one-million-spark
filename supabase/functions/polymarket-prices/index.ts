import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-prices — Lightweight price + volume refresh.
 *
 * Called by frontend polling (45s) to keep prices and volume fresh.
 * Image enrichment is SKIPPED by default to stay within CPU limits.
 * Pass { enrich: true } to run image enrichment (use sparingly).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";

/** Parse real outcome names from Gamma outcomes JSON string */
function parseOutcomeNames(outcomesStr: string | null): [string, string] | null {
  if (!outcomesStr) return null;
  try {
    const arr = JSON.parse(outcomesStr);
    if (Array.isArray(arr) && arr.length >= 2) return [arr[0], arr[1]];
  } catch { /* ignore */ }
  return null;
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

    // Get all Polymarket-backed fights that need price updates.
    const { data: fights, error } = await supabase
      .from("prediction_fights")
      .select("id, polymarket_outcome_a_token, polymarket_outcome_b_token, polymarket_condition_id, polymarket_market_id, fighter_a_name, fighter_b_name, event_name, event_id, trading_allowed")
      .not("polymarket_outcome_a_token", "is", null)
      .in("status", ["open", "locked", "live"]);

    if (error) throw error;
    if (!fights || fights.length === 0) {
      return json({ updated: 0 });
    }

    let updated = 0;
    const errors: string[] = [];
    const enriched: string[] = [];

    // Process in batches of 8 (prices-only is lightweight)
    const BATCH_SIZE = 8;
    for (let i = 0; i < fights.length; i += BATCH_SIZE) {
      const batch = fights.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (fight) => {
          let priceA = 0;
          let priceB = 0;
          let totalVolume = 0;
          let poolAUsd = 0;
          let poolBUsd = 0;
          let gammaOutcomes: [string, string] | null = null;
          let gammaDescription: string | null = null;
          let gammaLiquidity = 0;
          let gammaVolume24h = 0;
          let gammaStartDate: string | null = null;
          let gammaCompetitive: number | null = null;
          let gammaFee: string | null = null;
          let priceSource: "gamma" | "clob" | "data_api" | "none" = "none";
          let marketResolved = false;

          // ── 1. Gamma market data (canonical prices) ──
          if (fight.polymarket_market_id) {
            try {
              const gammaRes = await fetch(`${GAMMA_BASE}/markets/${fight.polymarket_market_id}`);
              if (gammaRes.ok) {
                const market = await gammaRes.json();
                if (market) {
                  totalVolume = parseFloat(market.volumeNum || market.volume || "0");
                  const bestBidA = parseFloat(market.bestBid || "0");
                  const bestAskA = parseFloat(market.bestAsk || "0");
                  const lastTradeA = parseFloat(market.lastTradePrice || "0");

                  if (market.outcomePrices) {
                    try {
                      const gammaPrices = JSON.parse(market.outcomePrices);
                      if (Array.isArray(gammaPrices) && gammaPrices.length >= 2) {
                        const gA = parseFloat(gammaPrices[0] || "0");
                        const gB = parseFloat(gammaPrices[1] || "0");
                        if (gA > 0 || gB > 0) {
                          priceA = gA;
                          priceB = gB;
                          priceSource = "gamma";
                          if (priceA > 0 && priceA <= 1 && priceB === 0) priceB = Math.round((1 - priceA) * 10000) / 10000;
                          else if (priceB > 0 && priceB <= 1 && priceA === 0) priceA = Math.round((1 - priceB) * 10000) / 10000;
                        }
                      }
                    } catch { /* ignore */ }
                  }

                  // Sanity check: extreme prices with active trading
                  const isExtreme = (priceA <= 0.01 || priceA >= 0.99) && (priceB <= 0.01 || priceB >= 0.99);
                  const hasReliableFallback = (bestBidA > 0.01 && bestBidA < 0.99)
                    || (bestAskA > 0.01 && bestAskA < 0.99)
                    || (lastTradeA > 0.01 && lastTradeA < 0.99);

                  if (isExtreme && hasReliableFallback) {
                    const reliablePrice = bestBidA > 0.01 && bestBidA < 0.99 ? bestBidA
                      : bestAskA > 0.01 && bestAskA < 0.99 ? bestAskA
                      : lastTradeA;
                    priceA = reliablePrice;
                    priceB = Math.round((1 - reliablePrice) * 10000) / 10000;
                    priceSource = "gamma";
                  } else if (isExtreme && !hasReliableFallback) {
                    marketResolved = true;
                  }

                  if (totalVolume > 0 && priceA > 0 && priceB > 0) {
                    poolAUsd = Math.round(totalVolume * priceA * 100) / 100;
                    poolBUsd = Math.round(totalVolume * priceB * 100) / 100;
                  }

                  gammaOutcomes = parseOutcomeNames(market.outcomes);
                  gammaDescription = market.description || null;
                  gammaLiquidity = parseFloat(market.liquidity || "0");
                  gammaVolume24h = parseFloat(market.volume24hr || "0");
                  gammaStartDate = market.startDate || null;
                  gammaCompetitive = market.competitive != null ? parseFloat(market.competitive) : null;
                  gammaFee = market.fee || null;
                }
              } else {
                // Consume body to prevent resource leak
                await gammaRes.text();
              }
            } catch (e) {
              console.warn(`[polymarket-prices] Gamma failed ${fight.id}:`, e);
            }
          }

          // ── 2. CLOB fallback ──
          if (priceA === 0 && priceB === 0) {
            try {
              const [resA, resB] = await Promise.all([
                fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_a_token}&side=BUY`),
                fight.polymarket_outcome_b_token
                  ? fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_b_token}&side=BUY`)
                  : Promise.resolve(null),
              ]);
              if (resA.ok) {
                const dataA = await resA.json();
                priceA = parseFloat(dataA?.price || "0");
              } else { await resA.text(); }
              if (resB && resB.ok) {
                const dataB = await resB.json();
                priceB = parseFloat(dataB?.price || "0");
              } else if (resB) { await resB.text(); }
              if (priceA > 0 || priceB > 0) {
                priceSource = "clob";
                if (priceA > 0 && priceA <= 1 && priceB === 0) priceB = Math.round((1 - priceA) * 10000) / 10000;
                else if (priceB > 0 && priceB <= 1 && priceA === 0) priceA = Math.round((1 - priceB) * 10000) / 10000;
                if (totalVolume > 0 && priceA > 0 && priceB > 0) {
                  poolAUsd = Math.round(totalVolume * priceA * 100) / 100;
                  poolBUsd = Math.round(totalVolume * priceB * 100) / 100;
                }
              }
            } catch (e) {
              console.warn(`[polymarket-prices] CLOB failed ${fight.id}:`, e);
            }
          }

          // ── 3. Build update payload (prices + metadata only) ──
          const updatePayload: Record<string, any> = {
            price_a: priceA,
            price_b: priceB,
            polymarket_last_synced_at: new Date().toISOString(),
          };

          if (fight.trading_allowed === false && fight.polymarket_outcome_a_token && fight.polymarket_outcome_b_token) {
            updatePayload.trading_allowed = true;
          }

          if (marketResolved) {
            updatePayload.polymarket_active = false;
            updatePayload.status = "locked";
          }

          if (totalVolume > 0) updatePayload.polymarket_volume_usd = totalVolume;
          if (poolAUsd > 0 || poolBUsd > 0) {
            updatePayload.pool_a_usd = poolAUsd;
            updatePayload.pool_b_usd = poolBUsd;
          }
          if (gammaLiquidity > 0) updatePayload.polymarket_liquidity = gammaLiquidity;
          if (gammaVolume24h > 0) updatePayload.polymarket_volume_24h = gammaVolume24h;
          if (gammaStartDate) updatePayload.polymarket_start_date = gammaStartDate;
          if (gammaCompetitive != null) updatePayload.polymarket_competitive = gammaCompetitive;
          if (gammaFee) updatePayload.polymarket_fee = gammaFee;

          // Backfill outcome names
          if (gammaOutcomes) {
            const [nameA, nameB] = gammaOutcomes;
            if (fight.fighter_a_name === "Yes" && nameA !== "Yes") updatePayload.fighter_a_name = nameA;
            if (fight.fighter_b_name === "No" && nameB !== "No") updatePayload.fighter_b_name = nameB;
          }

          if (gammaDescription && !fight.polymarket_question) {
            updatePayload.polymarket_question = gammaDescription;
          }

          await supabase
            .from("prediction_fights")
            .update(updatePayload)
            .eq("id", fight.id);

          return { id: fight.id, priceA, priceB, totalVolume };
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") updated++;
        else errors.push(r.reason?.message || "unknown");
      }
    }

    return json({
      updated,
      total: fights.length,
      enriched: enriched.length > 0 ? enriched : undefined,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
