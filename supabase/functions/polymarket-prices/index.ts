import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-prices — Lightweight price-refresh endpoint.
 *
 * Called by frontend polling or pg_cron to keep displayed prices fresh.
 * Fetches best BUY prices from CLOB API (public, no auth).
 * 
 * POST body: {} (no params needed — refreshes all active Polymarket fights)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";

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
      .select("id, polymarket_outcome_a_token, polymarket_outcome_b_token")
      .eq("polymarket_active", true)
      .not("polymarket_outcome_a_token", "is", null)
      .in("status", ["open", "locked", "live"]);

    if (error) throw error;
    if (!fights || fights.length === 0) {
      return json({ updated: 0 });
    }

    // Batch fetch prices (CLOB /price is public)
    let updated = 0;
    const errors: string[] = [];

    // Process in batches of 5 to avoid overwhelming the API
    const BATCH_SIZE = 5;
    for (let i = 0; i < fights.length; i += BATCH_SIZE) {
      const batch = fights.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (fight) => {
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

          await supabase
            .from("prediction_fights")
            .update({
              price_a: priceA,
              price_b: priceB,
              polymarket_last_synced_at: new Date().toISOString(),
            })
            .eq("id", fight.id);

          return { id: fight.id, priceA, priceB };
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
