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
 * 1. Fetch all fights with a polymarket ID in status live/locked/open
 * 2. For each, check Gamma API for resolution (closed = true, winner token price ≈ 1)
 * 3. If resolved, set winner, status → confirmed, claims_open_at → now + 3 min
 * 4. Log to automation_logs
 *
 * Market lookup priority:
 *   - Primary: /markets/{polymarket_market_id} (direct, always correct)
 *   - Fallback: /markets?condition_id={id}&limit=1 (validated)
 */

const GAMMA_API = "https://gamma-api.polymarket.com";
const CLAIMS_DELAY_MS = 3 * 60 * 1000; // 3-minute safety buffer

interface GammaMarket {
  conditionId: string;
  closed: boolean;
  outcomePrices: string;
  outcomes: string;
  question: string;
  tokens?: { token_id: string; outcome: string }[];
  clobTokenIds?: string;
}

interface FightRow {
  id: string;
  fighter_a_name: string;
  fighter_b_name: string;
  polymarket_condition_id: string | null;
  polymarket_market_id: string | null;
  polymarket_outcome_a_token: string | null;
  polymarket_outcome_b_token: string | null;
  status: string;
  winner: string | null;
}

/**
 * Fetch market data from Gamma API.
 * Prefers direct /markets/{id} lookup when polymarket_market_id is available.
 * Falls back to condition_id search with validation.
 */
async function fetchGammaMarket(
  marketId: string | null,
  conditionId: string | null,
): Promise<GammaMarket | null> {
  // Primary: direct market ID lookup
  if (marketId) {
    try {
      const res = await fetch(`${GAMMA_API}/markets/${marketId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.conditionId) return data;
      }
    } catch {
      // fall through to fallback
    }
  }

  // Fallback: condition_id search with validation
  if (conditionId) {
    try {
      const res = await fetch(
        `${GAMMA_API}/markets?condition_id=${conditionId}&limit=1`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const market = data?.[0];
      // Validate the returned market actually matches our condition_id
      if (market && market.conditionId === conditionId) return market;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Detect winner by mapping Polymarket outcome prices to fighter_a / fighter_b.
 *
 * Strategy (in priority order):
 * 1. Token ID matching: use polymarket_outcome_a_token / _b_token
 * 2. Outcome name matching: compare market outcomes to fighter names
 * 3. Positional fallback: outcomes[0] = fighter_a, outcomes[1] = fighter_b
 */
function detectWinner(
  market: GammaMarket,
  fight: FightRow,
): "fighter_a" | "fighter_b" | null {
  if (!market.closed) return null;

  let prices: number[];
  try {
    prices = JSON.parse(market.outcomePrices);
  } catch {
    return null;
  }

  if (prices.length < 2) return null;

  const THRESHOLD = 0.95;

  // Find the winning outcome index (price ≈ 1.0)
  let winningIndex = -1;
  if (prices[0] >= THRESHOLD && prices[1] <= 1 - THRESHOLD) {
    winningIndex = 0;
  } else if (prices[1] >= THRESHOLD && prices[0] <= 1 - THRESHOLD) {
    winningIndex = 1;
  } else {
    return null; // No clear winner (draw/void/refund)
  }

  // Parse outcome names and token IDs from the market
  let outcomeNames: string[] = [];
  try {
    outcomeNames = JSON.parse(market.outcomes);
  } catch {
    // ignore
  }

  let tokenIds: string[] = [];
  try {
    if (market.clobTokenIds) {
      tokenIds = JSON.parse(market.clobTokenIds);
    }
  } catch {
    // ignore
  }

  // Strategy 1: Token ID matching
  if (
    fight.polymarket_outcome_a_token &&
    fight.polymarket_outcome_b_token &&
    tokenIds.length >= 2
  ) {
    const winningTokenId = tokenIds[winningIndex];
    if (winningTokenId === fight.polymarket_outcome_a_token) return "fighter_a";
    if (winningTokenId === fight.polymarket_outcome_b_token) return "fighter_b";
  }

  // Strategy 2: Outcome name matching
  if (outcomeNames.length >= 2) {
    const winningName = outcomeNames[winningIndex]?.toLowerCase().trim() ?? "";
    const nameA = fight.fighter_a_name.toLowerCase().trim();
    const nameB = fight.fighter_b_name.toLowerCase().trim();

    // Check if winning outcome name contains or matches fighter name
    if (nameMatchScore(winningName, nameA) > nameMatchScore(winningName, nameB)) {
      return "fighter_a";
    }
    if (nameMatchScore(winningName, nameB) > nameMatchScore(winningName, nameA)) {
      return "fighter_b";
    }
  }

  // Strategy 3: Positional fallback (outcomes[0] = fighter_a, outcomes[1] = fighter_b)
  // This matches the import convention used by polymarket-sync
  if (winningIndex === 0) return "fighter_a";
  if (winningIndex === 1) return "fighter_b";

  return null;
}

/**
 * Simple name matching score.
 * Returns higher value for better matches.
 */
function nameMatchScore(outcomeName: string, fighterName: string): number {
  if (outcomeName === fighterName) return 100;
  if (outcomeName.includes(fighterName)) return 80;
  if (fighterName.includes(outcomeName)) return 70;

  // Check last word (team abbreviation or surname)
  const outWords = outcomeName.split(/\s+/);
  const fightWords = fighterName.split(/\s+/);
  const outLast = outWords[outWords.length - 1];
  const fightLast = fightWords[fightWords.length - 1];
  if (outLast && fightLast && outLast === fightLast) return 60;
  if (outLast && fightLast && (outLast.includes(fightLast) || fightLast.includes(outLast))) return 50;

  return 0;
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

    // Fetch fights that have a Polymarket ID and are in an unresolved status
    const { data: fights, error: fetchErr } = await supabase
      .from("prediction_fights")
      .select(
        "id, fighter_a_name, fighter_b_name, polymarket_condition_id, polymarket_market_id, polymarket_outcome_a_token, polymarket_outcome_b_token, status, winner",
      )
      .is("winner", null)
      .in("status", ["live", "locked", "open"])
      .order("event_date", { ascending: false, nullsFirst: false })
      .limit(100);

    if (fetchErr) throw fetchErr;
    if (!fights || fights.length === 0) {
      return json({ detected: 0, message: "No unresolved Polymarket fights" });
    }

    // Filter to fights that have at least one Polymarket identifier
    const eligibleFights = fights.filter(
      (f: FightRow) => f.polymarket_market_id || f.polymarket_condition_id,
    );

    if (eligibleFights.length === 0) {
      return json({ detected: 0, message: "No fights with Polymarket IDs" });
    }

    const now = new Date();
    const claimsOpenAt = new Date(now.getTime() + CLAIMS_DELAY_MS).toISOString();
    const results: { id: string; winner: string | null; ok: boolean; error?: string }[] = [];

    for (const fight of eligibleFights as FightRow[]) {
      try {
        const market = await fetchGammaMarket(
          fight.polymarket_market_id,
          fight.polymarket_condition_id,
        );

        if (!market) {
          results.push({ id: fight.id, winner: null, ok: false, error: "gamma_fetch_failed" });
          continue;
        }

        if (!market.closed) {
          // Market still active — skip silently
          continue;
        }

        const winner = detectWinner(market, fight);
        if (!winner) {
          results.push({ id: fight.id, winner: null, ok: false, error: "winner_unclear" });

          await supabase.from("automation_logs").insert({
            action: "result_detect_unclear",
            fight_id: fight.id,
            source: "prediction-result-detect",
            details: {
              market_id: fight.polymarket_market_id,
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
            market_id: fight.polymarket_market_id,
            condition_id: fight.polymarket_condition_id,
            outcome_prices: market.outcomePrices,
            outcomes: market.outcomes,
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
      checked: eligibleFights.length,
      results,
    });
  } catch (err: any) {
    console.error("[result-detect] Error:", err);
    return json({ error: err.message }, 500);
  }
});
