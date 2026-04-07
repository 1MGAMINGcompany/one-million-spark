import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * prediction-result-detect
 *
 * Queries the Polymarket Gamma API for resolved markets and advances
 * prediction_fights from "live" → "confirmed" with the winner populated.
 *
 * Also handles "locked" and "open" fights whose Polymarket market has resolved.
 *
 * Flow:
 * 1. Fetch all fights with a polymarket_condition_id in status live/locked/open
 * 2. For each, check Gamma API for resolution (closed = true, winner token price = 1)
 * 3. If resolved, set winner, status → confirmed, claims_open_at → now + 3 min
 * 4. Log to automation_logs
 */

const GAMMA_API = "https://gamma-api.polymarket.com";
const CLAIMS_DELAY_MS = 3 * 60 * 1000; // 3-minute safety buffer

interface GammaMarket {
  conditionId: string;
  closed: boolean;
  outcomePrices: string;
  outcomes: string;
  question: string;
}

async function fetchGammaMarket(conditionId: string): Promise<GammaMarket | null> {
  try {
    const res = await fetch(`${GAMMA_API}/markets?condition_id=${conditionId}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

function detectWinner(
  market: GammaMarket,
  fight: { fighter_a_name: string; fighter_b_name: string; polymarket_outcome_a_token?: string; polymarket_outcome_b_token?: string },
): "fighter_a" | "fighter_b" | null {
  if (!market.closed) return null;

  let prices: number[];
  try {
    prices = JSON.parse(market.outcomePrices);
  } catch {
    return null;
  }

  // Standard 2-outcome market: winning outcome has price ≈ 1
  if (prices.length >= 2) {
    const THRESHOLD = 0.95;
    if (prices[0] >= THRESHOLD && prices[1] <= (1 - THRESHOLD)) return "fighter_a";
    if (prices[1] >= THRESHOLD && prices[0] <= (1 - THRESHOLD)) return "fighter_b";
  }

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

    // Kill switch
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("automation_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.automation_enabled) {
      return json({ detected: 0, message: "Automation disabled" });
    }

    // Fetch fights that have a Polymarket condition ID and are in an unresolved status
    const { data: fights, error: fetchErr } = await supabase
      .from("prediction_fights")
      .select("id, fighter_a_name, fighter_b_name, polymarket_condition_id, polymarket_outcome_a_token, polymarket_outcome_b_token, status, winner")
      .not("polymarket_condition_id", "is", null)
      .is("winner", null)
      .in("status", ["live", "locked", "open"])
      .limit(100);

    if (fetchErr) throw fetchErr;
    if (!fights || fights.length === 0) {
      return json({ detected: 0, message: "No unresolved Polymarket fights" });
    }

    const now = new Date();
    const claimsOpenAt = new Date(now.getTime() + CLAIMS_DELAY_MS).toISOString();
    const results: { id: string; winner: string | null; ok: boolean; error?: string }[] = [];

    for (const fight of fights) {
      try {
        const market = await fetchGammaMarket(fight.polymarket_condition_id!);
        if (!market) {
          results.push({ id: fight.id, winner: null, ok: false, error: "gamma_fetch_failed" });
          continue;
        }

        if (!market.closed) {
          // Market still active — skip
          continue;
        }

        const winner = detectWinner(market, fight);
        if (!winner) {
          // Market closed but can't determine winner (e.g. refund/void)
          results.push({ id: fight.id, winner: null, ok: false, error: "winner_unclear" });

          await supabase.from("automation_logs").insert({
            action: "result_detect_unclear",
            fight_id: fight.id,
            source: "prediction-result-detect",
            details: {
              condition_id: fight.polymarket_condition_id,
              outcome_prices: market.outcomePrices,
              outcomes: market.outcomes,
            },
          });
          continue;
        }

        // Update fight with winner and advance to confirmed
        const { error: updateErr } = await supabase
          .from("prediction_fights")
          .update({
            winner,
            status: "confirmed",
            confirmed_at: now.toISOString(),
            claims_open_at: claimsOpenAt,
            polymarket_active: false,
          })
          .eq("id", fight.id)
          .in("status", ["live", "locked", "open"]); // CAS guard

        if (updateErr) {
          results.push({ id: fight.id, winner, ok: false, error: updateErr.message });
          continue;
        }

        await supabase.from("automation_logs").insert({
          action: "result_detected",
          fight_id: fight.id,
          source: "prediction-result-detect",
          details: {
            winner,
            condition_id: fight.polymarket_condition_id,
            outcome_prices: market.outcomePrices,
            claims_open_at: claimsOpenAt,
          },
        });

        results.push({ id: fight.id, winner, ok: true });
        console.log(`[result-detect] Fight ${fight.id}: winner=${winner}`);
      } catch (fightErr: any) {
        results.push({ id: fight.id, winner: null, ok: false, error: fightErr.message });
      }
    }

    return json({
      detected: results.filter((r) => r.ok).length,
      checked: fights.length,
      results,
    });
  } catch (err: any) {
    console.error("[result-detect] Error:", err);
    return json({ error: err.message }, 500);
  }
});
