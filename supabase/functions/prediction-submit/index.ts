import { createClient } from "@supabase/supabase-js";

/**
 * prediction-submit — Source-aware prediction submission.
 *
 * Polymarket-backed events: Orders routed through user's CLOB credentials
 * Native 1MGAMING events: Local pool accounting only
 *
 * Builder wallet is NEVER used as the user's trading identity.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const MIN_PREDICTION_USD = 1.0;
const DEFAULT_FEE_BPS = 500;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Generate HMAC signature for Polymarket CLOB API authentication.
 */
async function generateClobHmac(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = "",
): Promise<string> {
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Submit a BUY order to Polymarket CLOB using user's credentials.
 */
async function submitClobOrder(
  session: { pm_api_key: string; pm_api_secret: string; pm_passphrase: string },
  tokenId: string,
  price: number,
  size: number,
): Promise<{ orderId: string | null; status: string; error?: string }> {
  const orderBody = JSON.stringify({
    tokenID: tokenId,
    price: price.toFixed(2),
    size: size.toFixed(2),
    side: "BUY",
    feeRateBps: 0,
    nonce: Date.now().toString(),
    expiration: "0", // GTC
    taker: "0x0000000000000000000000000000000000000000",
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = "/order";
  const hmac = await generateClobHmac(session.pm_api_secret, timestamp, "POST", path, orderBody);

  const res = await fetch(`${CLOB_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "POLY_API_KEY": session.pm_api_key,
      "POLY_SIGNATURE": hmac,
      "POLY_PASSPHRASE": session.pm_passphrase,
      "POLY_TIMESTAMP": timestamp,
    },
    body: orderBody,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[prediction-submit] CLOB order failed (${res.status}): ${errText}`);
    return { orderId: null, status: "clob_error", error: errText };
  }

  const data = await res.json();
  return {
    orderId: data.orderID || data.id || null,
    status: data.orderID ? "submitted" : "accepted",
  };
}

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

    // ── Kill switch ──
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

    // ── Validate fight ──
    const { data: fight, error: fightErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fightErr || !fight) return json({ error: "Fight not found" }, 404);
    if (fight.status !== "open") {
      return json({ error: "Predictions are closed for this fight" }, 400);
    }

    // ── Commission calculation ──
    const commissionBps = Number(fight.commission_bps ?? DEFAULT_FEE_BPS);
    const fee_usd = Number((parsedAmount * commissionBps / 10_000).toFixed(6));
    const pool_usd = Number((parsedAmount - fee_usd).toFixed(6));
    const shares = Math.floor(pool_usd * 100);

    // ══════════════════════════════════════════════════
    // SOURCE-AWARE ORDER ROUTING
    // ══════════════════════════════════════════════════
    const isPolymarketBacked = !!(fight.polymarket_market_id && fight.polymarket_outcome_a_token);
    let polymarket_order_id: string | null = null;
    let polymarket_status = "pending";

    if (isPolymarketBacked) {
      const walletLower = normalizedWallet.toLowerCase();

      // Get user's Polymarket session
      const { data: pmSession } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, pm_api_key, pm_api_secret, pm_passphrase, pm_derived_address, expires_at")
        .eq("wallet", walletLower)
        .maybeSingle();

      const tokenId = fighter_pick === "fighter_a"
        ? fight.polymarket_outcome_a_token
        : fight.polymarket_outcome_b_token;

      const price = fighter_pick === "fighter_a"
        ? Number(fight.price_a || 0.5)
        : Number(fight.price_b || 0.5);

      const isSessionValid = pmSession?.status === "active"
        && pmSession.pm_api_key
        && pmSession.pm_api_secret
        && pmSession.pm_passphrase
        && (!pmSession.expires_at || new Date(pmSession.expires_at) > new Date());

      if (isSessionValid && tokenId) {
        // ── LIVE ORDER: Submit to Polymarket CLOB via user's credentials ──
        const orderResult = await submitClobOrder(
          {
            pm_api_key: pmSession!.pm_api_key!,
            pm_api_secret: pmSession!.pm_api_secret!,
            pm_passphrase: pmSession!.pm_passphrase!,
          },
          tokenId,
          price,
          pool_usd,
        );

        polymarket_order_id = orderResult.orderId;
        polymarket_status = orderResult.orderId ? "submitted" : orderResult.status;

        if (orderResult.error) {
          console.warn(`[prediction-submit] CLOB order issue: ${orderResult.error}`);
        }

        console.log(`[prediction-submit] Polymarket order: user=${walletLower}, token=${tokenId}, amount=$${pool_usd}, price=${price}, status=${polymarket_status}`);
      } else {
        // ── DEFERRED: User needs PM auth first ──
        polymarket_status = "awaiting_user_auth";
        console.log(`[prediction-submit] Polymarket deferred: user=${walletLower} needs PM auth`);
      }
    }

    // ── Insert prediction entry ──
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

    // ── Update fight pool totals ──
    const { error: updateErr } = await supabase.rpc("prediction_update_pool_usd", {
      p_fight_id: fight_id,
      p_pool_usd: pool_usd,
      p_shares: shares,
      p_side: fighter_pick,
    });

    if (updateErr) {
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
      polymarket_order_id: polymarket_order_id || undefined,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
