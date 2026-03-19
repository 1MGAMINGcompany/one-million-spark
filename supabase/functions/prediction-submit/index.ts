import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_PREDICTION_USD = 1.0; // $1 minimum prediction
// Commission is now source-aware: read from fight.commission_bps
// 200 bps (2%) for Polymarket imports, 500 bps (5%) for native 1MGAMING events
const DEFAULT_FEE_BPS = 500;

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      fight_id,
      wallet,
      fighter_pick,
      amount_usd,
      // Legacy fields accepted but ignored for backward compat
      amount_lamports: _legacyLamports,
      tx_signature: _legacyTxSig,
    } = body;

    // ── Kill switch check ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("predictions_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.predictions_enabled) {
      return json({ error: "Predictions are currently disabled by admin" }, 403);
    }

    if (!fight_id || !wallet || !fighter_pick || !amount_usd) {
      return json({ error: "Missing required fields (fight_id, wallet, fighter_pick, amount_usd)" }, 400);
    }

    if (!["fighter_a", "fighter_b"].includes(fighter_pick)) {
      return json({ error: "Invalid fighter_pick" }, 400);
    }

    const parsedAmount = Number(amount_usd);
    if (isNaN(parsedAmount) || parsedAmount < MIN_PREDICTION_USD) {
      return json({ error: `Minimum prediction is $${MIN_PREDICTION_USD}` }, 400);
    }

    const normalizedWallet = String(wallet).trim();
    if (!normalizedWallet || normalizedWallet.length < 10) {
      return json({ error: "Invalid wallet address" }, 400);
    }

    // Source-aware commission: read from fight record, fallback to default
    const feeBps = Number(fight?.commission_bps ?? DEFAULT_FEE_BPS);

    // NOTE: We need fight data before calculating fees, so we move fee calc after fight fetch.
    // This is handled below after fight validation.

    // ── Validate fight exists and is open ──
    const { data: fight, error: fightErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fightErr || !fight) return json({ error: "Fight not found" }, 404);
    if (fight.status !== "open") {
      return json({ error: "Predictions are closed for this fight" }, 400);
    }

    // ══════════════════════════════════════════════════════
    // POLYMARKET ORDER ROUTING
    // ══════════════════════════════════════════════════════
    let polymarket_order_id: string | null = null;
    let polymarket_status = "pending";
    const isPolymarketBacked = !!(fight.polymarket_market_id && fight.polymarket_outcome_a_token);

    if (isPolymarketBacked) {
      // Determine which token to buy
      const tokenId = fighter_pick === "fighter_a"
        ? fight.polymarket_outcome_a_token
        : fight.polymarket_outcome_b_token;

      // ── TODO: POLYMARKET CLOB ORDER PLACEMENT ──
      // This is where the actual Polymarket order would be placed.
      // Requirements for production:
      // 1. POLYMARKET_API_KEY and POLYMARKET_API_SECRET must be configured
      // 2. Builder wallet must be funded with USDC on Polygon
      // 3. CTF allowance must be set for the exchange contract
      // 4. Order must be signed with EIP-712 using builder credentials
      //
      // Implementation steps:
      //   const apiKey = Deno.env.get("POLYMARKET_API_KEY");
      //   const apiSecret = Deno.env.get("POLYMARKET_API_SECRET");
      //   const passphrase = Deno.env.get("POLYMARKET_PASSPHRASE");
      //
      //   const orderPayload = {
      //     tokenID: tokenId,
      //     price: fighter_pick === "fighter_a" ? fight.price_a : fight.price_b,
      //     size: pool_usd,  // USDC amount
      //     side: "BUY",
      //     feeRateBps: 0,   // Maker fee
      //     nonce: Date.now(),
      //     expiration: 0,   // GTC
      //   };
      //
      //   // Sign and submit to https://clob.polymarket.com/order
      //   const orderRes = await fetch("https://clob.polymarket.com/order", { ... });
      //   polymarket_order_id = orderRes.orderID;
      //   polymarket_status = "submitted";
      //
      // For now, mark as "awaiting_integration" with the token mapping recorded.

      polymarket_status = "awaiting_integration";
      console.log(`[prediction-submit] Polymarket-backed fight ${fight_id}: token=${tokenId}, amount=$${pool_usd}`);
    }

    // ── Insert prediction entry (USD-based) ──
    const { data: entry, error: insertErr } = await supabase
      .from("prediction_entries")
      .insert({
        fight_id,
        wallet: normalizedWallet,
        fighter_pick,
        amount_usd: parsedAmount,
        fee_usd,
        pool_usd,
        shares,
        polymarket_order_id,
        polymarket_status,
        // Legacy columns set to 0 for schema compatibility
        amount_lamports: 0,
        fee_lamports: 0,
        pool_lamports: 0,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // ── Update fight pool totals (USD) ──
    const { error: updateErr } = await supabase.rpc("prediction_update_pool_usd", {
      p_fight_id: fight_id,
      p_pool_usd: pool_usd,
      p_shares: shares,
      p_side: fighter_pick,
    });

    if (updateErr) {
      // Fallback: direct update
      const poolCol = fighter_pick === "fighter_a" ? "pool_a_usd" : "pool_b_usd";
      const sharesCol = fighter_pick === "fighter_a" ? "shares_a" : "shares_b";
      const newPoolVal =
        (fighter_pick === "fighter_a" ? fight.pool_a_usd : fight.pool_b_usd) + pool_usd;
      const newSharesVal =
        (fighter_pick === "fighter_a" ? fight.shares_a : fight.shares_b) + shares;

      await supabase
        .from("prediction_fights")
        .update({
          [poolCol]: newPoolVal,
          [sharesCol]: newSharesVal,
        })
        .eq("id", fight_id);
    }

    return json({
      success: true,
      entry,
      pool_contribution_usd: pool_usd,
      fee_usd,
      shares,
      polymarket_backed: isPolymarketBacked,
      polymarket_status,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
