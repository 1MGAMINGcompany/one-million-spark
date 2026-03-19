import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_PREDICTION_USD = 1.0;
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { fight_id, wallet, fighter_pick, amount_usd } = body;

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

    // ── Source-aware commission calculation ──
    const commissionBps = Number(fight.commission_bps ?? DEFAULT_FEE_BPS);
    const fee_usd = Number((parsedAmount * commissionBps / 10_000).toFixed(6));
    const pool_usd = Number((parsedAmount - fee_usd).toFixed(6));
    const shares = Math.floor(pool_usd * 100);

    // ══════════════════════════════════════════════════════
    // SOURCE-AWARE ORDER ROUTING
    // ══════════════════════════════════════════════════════
    const isPolymarketBacked = !!(fight.polymarket_market_id && fight.polymarket_outcome_a_token);
    let polymarket_order_id: string | null = null;
    let polymarket_status = "pending";

    if (isPolymarketBacked) {
      // ── POLYMARKET USER-AUTHENTICATED ORDER PATH ──
      // User identity is separate from builder identity.
      // The builder wallet is for platform attribution only.

      const walletLower = normalizedWallet.toLowerCase();

      // Step 1: Check user's Polymarket session
      const { data: pmSession } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, pm_api_key, pm_api_secret, pm_passphrase, pm_derived_address, ctf_allowance_set, expires_at")
        .eq("wallet", walletLower)
        .maybeSingle();

      const tokenId = fighter_pick === "fighter_a"
        ? fight.polymarket_outcome_a_token
        : fight.polymarket_outcome_b_token;

      const price = fighter_pick === "fighter_a"
        ? Number(fight.price_a || 0.5)
        : Number(fight.price_b || 0.5);

      if (pmSession?.status === "active" && pmSession.pm_api_key) {
        // ── LIVE ORDER PATH: User has active Polymarket credentials ──
        // Place order using USER's credentials (not builder wallet)
        //
        // Production implementation:
        //   const orderPayload = {
        //     tokenID: tokenId,
        //     price: price,
        //     size: pool_usd,
        //     side: "BUY",
        //     feeRateBps: 0,
        //     nonce: Date.now().toString(),
        //     expiration: 0, // GTC
        //   };
        //
        //   // Sign with USER's derived key (EIP-712)
        //   const signedOrder = signEIP712Order(orderPayload, pmSession.pm_derived_address);
        //
        //   // Submit to CLOB using USER's API credentials
        //   const orderRes = await fetch("https://clob.polymarket.com/order", {
        //     method: "POST",
        //     headers: {
        //       "Content-Type": "application/json",
        //       "POLY_API_KEY": pmSession.pm_api_key,
        //       "POLY_SIGNATURE": generateHmacSignature(pmSession.pm_api_secret, ...),
        //       "POLY_PASSPHRASE": pmSession.pm_passphrase,
        //       "POLY_TIMESTAMP": Date.now().toString(),
        //     },
        //     body: JSON.stringify(signedOrder),
        //   });
        //
        //   const orderData = await orderRes.json();
        //   polymarket_order_id = orderData.orderID;
        //   polymarket_status = "submitted";

        polymarket_status = "credentials_ready";
        console.log(`[prediction-submit] Polymarket order ready: user=${walletLower}, token=${tokenId}, amount=$${pool_usd}, price=${price}`);
      } else {
        // ── DEFERRED ORDER PATH: User doesn't have active PM credentials ──
        // Record the intent. The order will be placed once:
        // 1. POLYMARKET_API_KEY secret is configured
        // 2. User completes polymarket-auth flow
        polymarket_status = "awaiting_user_auth";
        console.log(`[prediction-submit] Polymarket deferred: user=${walletLower} needs PM auth, token=${tokenId}, amount=$${pool_usd}`);
      }
    }
    // else: Native 1MGAMING event — no Polymarket routing needed

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
        polymarket_status: isPolymarketBacked ? polymarket_status : null,
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
      const newPoolVal = (fighter_pick === "fighter_a" ? fight.pool_a_usd : fight.pool_b_usd) + pool_usd;
      const newSharesVal = (fighter_pick === "fighter_a" ? fight.shares_a : fight.shares_b) + shares;

      await supabase
        .from("prediction_fights")
        .update({ [poolCol]: newPoolVal, [sharesCol]: newSharesVal })
        .eq("id", fight_id);
    }

    return json({
      success: true,
      entry,
      pool_contribution_usd: pool_usd,
      fee_usd,
      commission_bps: commissionBps,
      source: fight.source || "manual",
      shares,
      polymarket_backed: isPolymarketBacked,
      polymarket_status: isPolymarketBacked ? polymarket_status : undefined,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
