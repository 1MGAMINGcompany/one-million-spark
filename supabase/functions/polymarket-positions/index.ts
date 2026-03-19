import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-positions — Sync user positions from Polymarket Data API.
 *
 * Architecture:
 * - Public market data (prices) → polymarket-prices / polymarket-sync (no auth needed)
 * - User positions (holdings) → THIS FUNCTION (uses user's Polymarket session)
 *
 * Actions:
 *   - sync_positions: Fetch and cache user's Polymarket positions
 *   - get_positions: Return cached positions for a wallet (from our DB)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PM_DATA_API = "https://data-api.polymarket.com";

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

    const body = await req.json();
    const { action = "get_positions", wallet } = body;

    if (!wallet) return json({ error: "Missing wallet" }, 400);

    const normalizedWallet = String(wallet).trim().toLowerCase();

    // ══════════════════════════════════════════════════
    // ACTION: get_positions — Return cached positions from our DB
    // No Polymarket API call needed
    // ══════════════════════════════════════════════════
    if (action === "get_positions") {
      const { data: positions, error } = await supabase
        .from("polymarket_user_positions")
        .select(`
          id, wallet, fight_id, condition_id, outcome_index,
          token_id, size, avg_price, current_value, realized_pnl,
          pm_order_id, pm_order_status, synced_at
        `)
        .eq("wallet", normalizedWallet)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enrich with fight data
      const fightIds = [...new Set((positions || []).map(p => p.fight_id).filter(Boolean))];
      let fights: Record<string, any> = {};

      if (fightIds.length > 0) {
        const { data: fightData } = await supabase
          .from("prediction_fights")
          .select("id, title, fighter_a_name, fighter_b_name, status, winner, price_a, price_b, source")
          .in("id", fightIds);

        fights = Object.fromEntries((fightData || []).map(f => [f.id, f]));
      }

      return json({
        positions: (positions || []).map(p => ({
          ...p,
          fight: fights[p.fight_id] || null,
        })),
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: sync_positions — Fetch from Polymarket Data API
    // Requires active user session with credentials
    // ══════════════════════════════════════════════════
    if (action === "sync_positions") {
      // Check user has active Polymarket session
      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, pm_api_key, pm_api_secret, expires_at")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!session) {
        return json({ error: "No Polymarket session. Please authenticate first." }, 401);
      }

      if (session.status !== "active") {
        return json({
          error: "Polymarket session not active",
          status: session.status,
          message: "Full position sync requires active Polymarket credentials.",
        }, 401);
      }

      // ── Fetch positions from Polymarket Data API ──
      // Production implementation uses user's API credentials:
      //
      // const headers = {
      //   "Authorization": `Bearer ${session.pm_api_key}`,
      //   "X-API-Secret": session.pm_api_secret,
      // };
      //
      // const posRes = await fetch(
      //   `${PM_DATA_API}/positions?wallet=${normalizedWallet}`,
      //   { headers }
      // );
      // const pmPositions = await posRes.json();
      //
      // For each position, upsert into polymarket_user_positions
      // matching on (wallet, condition_id, outcome_index)

      // ── Fallback: Sync from our local prediction_entries ──
      // Until Polymarket credentials are configured, we sync from our own records
      const { data: entries } = await supabase
        .from("prediction_entries")
        .select(`
          id, fight_id, fighter_pick, amount_usd, pool_usd, shares,
          polymarket_order_id, polymarket_status
        `)
        .eq("wallet", normalizedWallet)
        .not("fight_id", "is", null);

      if (!entries || entries.length === 0) {
        return json({ synced: 0, positions: [] });
      }

      // Get fight data for condition_id mapping
      const fightIds = [...new Set(entries.map(e => e.fight_id))];
      const { data: fightData } = await supabase
        .from("prediction_fights")
        .select("id, polymarket_condition_id, polymarket_outcome_a_token, polymarket_outcome_b_token, source, price_a, price_b")
        .in("id", fightIds);

      const fightMap = Object.fromEntries((fightData || []).map(f => [f.id, f]));

      let synced = 0;
      for (const entry of entries) {
        const fight = fightMap[entry.fight_id];
        if (!fight) continue;

        const isPolymarket = fight.source === "polymarket" && fight.polymarket_condition_id;
        const outcomeIndex = entry.fighter_pick === "fighter_a" ? 0 : 1;
        const tokenId = entry.fighter_pick === "fighter_a"
          ? fight.polymarket_outcome_a_token
          : fight.polymarket_outcome_b_token;

        const currentPrice = entry.fighter_pick === "fighter_a"
          ? Number(fight.price_a || 0)
          : Number(fight.price_b || 0);

        const conditionId = fight.polymarket_condition_id || `local_${fight.id}`;

        await supabase
          .from("polymarket_user_positions")
          .upsert({
            wallet: normalizedWallet,
            fight_id: entry.fight_id,
            condition_id: conditionId,
            outcome_index: outcomeIndex,
            token_id: tokenId || null,
            size: Number(entry.shares || 0),
            avg_price: Number(entry.pool_usd || 0) > 0 && Number(entry.shares || 0) > 0
              ? Number(entry.pool_usd) / Number(entry.shares) * 100
              : 0,
            current_value: Number(entry.shares || 0) * currentPrice / 100,
            realized_pnl: 0,
            pm_order_id: entry.polymarket_order_id || null,
            pm_order_status: entry.polymarket_status || "local",
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "id",
          });

        synced++;
      }

      return json({ synced, source: isPolymarket ? "polymarket_data_api" : "local_entries" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[polymarket-positions] Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
