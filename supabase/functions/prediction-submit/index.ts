import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

/**
 * prediction-submit — Production trade execution gateway.
 *
 * Polymarket-backed events: Orders routed through user's CLOB credentials
 * Native 1MGAMING events: Local pool accounting only
 *
 * Lifecycle: requested → submitted → filled/partial_fill/failed
 * Explicit fee model (Pattern 2): fee shown separately, never hidden in spread.
 * Builder wallet is NEVER used as the user's trading identity.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const MIN_PREDICTION_USD = 1.0;
const LEGACY_DEFAULT_FEE_BPS = 500;

/** Only these statuses allow new trades */
const TRADABLE_STATUSES = new Set(["open"]);

/** Max age (ms) for cached price data to be considered fresh (general gate) */
const MAX_PRICE_STALENESS_MS = 10 * 60 * 1000; // 10 minutes

/** Strict freshness for fallback when live price is unavailable */
const FALLBACK_MAX_PRICE_AGE_MS = 60 * 1000; // 60 seconds

/** Max order size (USDC) allowed when falling back to cached price */
const FALLBACK_MAX_ORDER_USDC = 25;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Helpers ──────────────────────────────────────────────

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
    expiration: "0",
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

/** Compact audit log writer — never includes secrets */
async function auditLog(
  supabase: any,
  tradeOrderId: string | null,
  wallet: string | null,
  action: string,
  requestPayload: Record<string, unknown> | null = null,
  responsePayload: Record<string, unknown> | null = null,
) {
  try {
    await supabase.from("prediction_trade_audit_log").insert({
      trade_order_id: tradeOrderId,
      wallet,
      action,
      request_payload_json: requestPayload,
      response_payload_json: responsePayload,
    });
  } catch (e) {
    console.warn("[prediction-submit] audit log write failed:", e);
  }
}

/** Update trade order status + optional fields */
async function updateTradeOrder(
  supabase: any,
  tradeOrderId: string,
  updates: Record<string, unknown>,
) {
  await supabase
    .from("prediction_trade_orders")
    .update(updates)
    .eq("id", tradeOrderId);
}

// ── Main handler ─────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let tradeOrderId: string | null = null;
  let normalizedWallet: string | null = null;

  try {
    const body = await req.json();
    const { fight_id, wallet, fighter_pick, amount_usd, slippage_bps: clientSlippage } = body;

    normalizedWallet = wallet ? String(wallet).trim().toLowerCase() : null;

    // ═══════════════════════════════════════════════════
    // 1) LOAD SYSTEM CONTROLS
    // ═══════════════════════════════════════════════════
    const { data: controls } = await supabase
      .from("prediction_system_controls")
      .select("*")
      .limit(1)
      .single();

    // Also check legacy kill switch for backward compat
    const { data: legacySettings } = await supabase
      .from("prediction_settings")
      .select("predictions_enabled")
      .eq("id", "global")
      .single();

    if (legacySettings && !legacySettings.predictions_enabled) {
      await auditLog(supabase, null, normalizedWallet, "trade_failed", { fight_id }, { reason: "legacy_kill_switch" });
      return json({ error: "Predictions are currently disabled by admin" }, 403);
    }

    if (controls && !controls.predictions_enabled) {
      await auditLog(supabase, null, normalizedWallet, "trade_failed", { fight_id }, { reason: "predictions_disabled" });
      return json({ error: "Predictions are currently disabled" }, 403);
    }

    if (controls && !controls.new_orders_enabled) {
      await auditLog(supabase, null, normalizedWallet, "trade_failed", { fight_id }, { reason: "new_orders_disabled" });
      return json({ error: "New prediction orders are temporarily paused" }, 403);
    }

    // ═══════════════════════════════════════════════════
    // BASIC VALIDATION
    // ═══════════════════════════════════════════════════
    if (!fight_id || !wallet || !fighter_pick || !amount_usd) {
      return json({ error: "Missing required fields (fight_id, wallet, fighter_pick, amount_usd)" }, 400);
    }

    if (!["fighter_a", "fighter_b"].includes(fighter_pick)) {
      return json({ error: "Invalid fighter_pick" }, 400);
    }

    const parsedAmount = Number(amount_usd);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return json({ error: "Amount must be greater than 0" }, 400);
    }
    if (parsedAmount < MIN_PREDICTION_USD) {
      return json({ error: `Minimum prediction is $${MIN_PREDICTION_USD}` }, 400);
    }

    if (!normalizedWallet || normalizedWallet.length < 10) {
      return json({ error: "Invalid wallet address" }, 400);
    }

    // ═══════════════════════════════════════════════════
    // 4) PER-ORDER LIMIT CHECK
    // ═══════════════════════════════════════════════════
    const maxOrderUsdc = controls ? Number(controls.max_order_usdc) : 250;
    if (parsedAmount > maxOrderUsdc) {
      await auditLog(supabase, null, normalizedWallet, "trade_failed", { amount_usd: parsedAmount }, { reason: "exceeds_max_order", max: maxOrderUsdc });
      return json({ error: `Maximum order size is $${maxOrderUsdc}` }, 400);
    }

    await auditLog(supabase, null, normalizedWallet, "request_received", {
      fight_id, fighter_pick, amount_usd: parsedAmount,
    });

    // ═══════════════════════════════════════════════════
    // 2) RESOLVE USER ACCOUNT
    // ═══════════════════════════════════════════════════
    let accountId: string | null = null;
    {
      const { data: existing } = await supabase
        .from("prediction_accounts")
        .select("id")
        .eq("wallet_evm", normalizedWallet)
        .maybeSingle();

      if (existing) {
        accountId = existing.id;
        await supabase
          .from("prediction_accounts")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", accountId);
      } else {
        const { data: created } = await supabase
          .from("prediction_accounts")
          .insert({ wallet_evm: normalizedWallet, auth_provider: "privy" })
          .select("id")
          .single();
        accountId = created?.id ?? null;
      }
    }

    // ═══════════════════════════════════════════════════
    // 3) DAILY LIMIT CHECK
    // ═══════════════════════════════════════════════════
    const maxDailyUsdc = controls ? Number(controls.max_daily_user_usdc) : 1000;
    {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from("prediction_trade_orders")
        .select("requested_amount_usdc")
        .eq("wallet", normalizedWallet)
        .gte("created_at", since)
        .not("status", "in", '("failed","cancelled")');

      const dailyTotal = (recentOrders || []).reduce(
        (sum: number, o: { requested_amount_usdc: number }) => sum + Number(o.requested_amount_usdc),
        0,
      );

      if (dailyTotal + parsedAmount > maxDailyUsdc) {
        await auditLog(supabase, null, normalizedWallet, "trade_failed", { amount_usd: parsedAmount, daily_total: dailyTotal }, { reason: "daily_limit_exceeded", max: maxDailyUsdc });
        return json({ error: `Daily limit of $${maxDailyUsdc} would be exceeded. Current 24h total: $${dailyTotal.toFixed(2)}` }, 400);
      }
    }

    // ═══════════════════════════════════════════════════
    // VALIDATE FIGHT
    // ═══════════════════════════════════════════════════
    const { data: fight, error: fightErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fightErr || !fight) {
      await auditLog(supabase, null, normalizedWallet, "trade_failed", { fight_id }, { reason: "fight_not_found" });
      return json({ error: "Fight not found" }, 404);
    }
    // ═══════════════════════════════════════════════════
    // VALIDATE FIGHT STATUS (tradability gate)
    // ═══════════════════════════════════════════════════
    if (!TRADABLE_STATUSES.has(fight.status)) {
      const errorCode = fight.status === "locked" ? "market_locked"
        : fight.status === "live" ? "market_locked"
        : fight.status === "settled" || fight.status === "confirmed" ? "market_settled"
        : fight.status === "cancelled" ? "market_cancelled"
        : "market_not_tradable";

      await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id, fight_status: fight.status }, { error_code: errorCode });
      return json({ error: "This market is no longer open for predictions", error_code: errorCode, fight_status: fight.status }, 400);
    }

    // ═══════════════════════════════════════════════════
    // SOURCE-AWARE ROUTING PREP (moved up for validation)
    // ═══════════════════════════════════════════════════
    const isPolymarketBacked = !!(fight.polymarket_market_id && fight.polymarket_outcome_a_token);

    const tokenId = isPolymarketBacked
      ? (fighter_pick === "fighter_a" ? fight.polymarket_outcome_a_token : fight.polymarket_outcome_b_token)
      : null;

    // ═══════════════════════════════════════════════════
    // POLYMARKET-SPECIFIC VALIDATIONS
    // ═══════════════════════════════════════════════════
    if (isPolymarketBacked) {
      // 1) Required market mapping
      if (!fight.polymarket_market_id) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id }, { error_code: "missing_market_mapping", field: "polymarket_market_id" });
        return json({ error: "Market configuration incomplete", error_code: "missing_market_mapping" }, 400);
      }
      if (!tokenId) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id, fighter_pick }, { error_code: "missing_market_mapping", field: "token_id" });
        return json({ error: "Market token configuration incomplete for this outcome", error_code: "missing_market_mapping" }, 400);
      }

      // 2) Polymarket active flag (source of truth: prediction_fights.polymarket_active)
      if (fight.polymarket_active === false) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id }, { error_code: "market_inactive" });
        return json({ error: "This Polymarket market is no longer active", error_code: "market_inactive" }, 400);
      }

      // 3) Polymarket end date check
      if (fight.polymarket_end_date && new Date(fight.polymarket_end_date) <= new Date()) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id }, { error_code: "market_expired", end_date: fight.polymarket_end_date });
        return json({ error: "This market has expired", error_code: "market_expired" }, 400);
      }

      // 4) Quote freshness check (reject if cached price older than threshold)
      const lastSynced = fight.polymarket_last_synced_at ? new Date(fight.polymarket_last_synced_at).getTime() : 0;
      const priceAge = Date.now() - lastSynced;
      if (lastSynced === 0 || priceAge > MAX_PRICE_STALENESS_MS) {
        await auditLog(supabase, null, normalizedWallet, "stale_quote_rejected", { fight_id }, {
          error_code: "stale_quote", price_age_ms: priceAge, threshold_ms: MAX_PRICE_STALENESS_MS,
          last_synced: fight.polymarket_last_synced_at || "never",
        });
        return json({ error: "Market price data is stale. Please try again shortly.", error_code: "stale_quote" }, 400);
      }
    }

    // ═══════════════════════════════════════════════════
    // 6) EXPLICIT FEE MODEL
    // ═══════════════════════════════════════════════════
    const systemFeeBps = controls ? Number(controls.default_fee_bps) : LEGACY_DEFAULT_FEE_BPS;
    const effectiveFeeBps = fight.commission_bps != null ? Number(fight.commission_bps) : systemFeeBps;
    const fee_usd = Number((parsedAmount * effectiveFeeBps / 10_000).toFixed(6));
    const net_amount_usdc = Number((parsedAmount - fee_usd).toFixed(6));
    const shares = Math.floor(net_amount_usdc * 100);

    // Slippage: use client value capped by system max
    const systemMaxSlippage = controls ? Number(controls.max_slippage_bps) : 300;
    const effectiveSlippage = clientSlippage != null
      ? Math.min(Number(clientSlippage), systemMaxSlippage)
      : systemMaxSlippage;

    // Expected price from cached data
    const expectedPrice = isPolymarketBacked
      ? Number(fighter_pick === "fighter_a" ? (fight.price_a || 0.5) : (fight.price_b || 0.5))
      : null;

    // ═══════════════════════════════════════════════════
    // SLIPPAGE CHECK — fetch live price and compare
    // ═══════════════════════════════════════════════════
    if (isPolymarketBacked && tokenId && expectedPrice != null && expectedPrice > 0) {
      try {
        const priceRes = await fetch(`${CLOB_BASE}/price?token_id=${tokenId}&side=BUY`);
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const livePrice = parseFloat(priceData?.price || "0");

          if (livePrice > 0) {
            const slippageBps = Math.abs(livePrice - expectedPrice) / expectedPrice * 10_000;
            if (slippageBps > effectiveSlippage) {
              await auditLog(supabase, null, normalizedWallet, "slippage_rejected", { fight_id, token_id: tokenId }, {
                error_code: "slippage_exceeded",
                expected_price: expectedPrice, live_price: livePrice,
                slippage_bps: Math.round(slippageBps), max_slippage_bps: effectiveSlippage,
              });
              return json({
                error: "Price has moved beyond acceptable range. Please retry.",
                error_code: "slippage_exceeded",
                expected_price: expectedPrice,
                live_price: livePrice,
              }, 400);
            }
          } else {
            // Live price returned 0/invalid — treat as fetch failure
            throw new Error("live_price_zero");
          }
        } else {
          throw new Error(`clob_http_${priceRes.status}`);
        }
      } catch (slipErr) {
        // ── LIVE PRICE UNAVAILABLE — strict fallback gate ──
        console.warn("[prediction-submit] Live price check failed:", slipErr);
        await auditLog(supabase, null, normalizedWallet, "live_price_fetch_failed", { fight_id, token_id: tokenId }, {
          error: String(slipErr),
        });

        const lastSyncedMs = fight.polymarket_last_synced_at
          ? new Date(fight.polymarket_last_synced_at).getTime()
          : 0;
        const cachedAge = Date.now() - lastSyncedMs;

        const fallbackAllowed =
          lastSyncedMs > 0 &&
          cachedAge <= FALLBACK_MAX_PRICE_AGE_MS &&
          fight.polymarket_active === true &&
          !!fight.polymarket_market_id &&
          !!tokenId &&
          parsedAmount <= FALLBACK_MAX_ORDER_USDC;

        if (!fallbackAllowed) {
          await auditLog(supabase, null, normalizedWallet, "cached_price_fallback_rejected", { fight_id }, {
            cached_age_ms: cachedAge,
            max_age_ms: FALLBACK_MAX_PRICE_AGE_MS,
            amount: parsedAmount,
            max_fallback_usdc: FALLBACK_MAX_ORDER_USDC,
            polymarket_active: fight.polymarket_active,
            has_token: !!tokenId,
          });
          return json({
            error: "Live pricing unavailable. Please try again in a moment.",
            error_code: "live_price_unavailable",
          }, 503);
        }

        await auditLog(supabase, null, normalizedWallet, "cached_price_fallback_allowed", { fight_id }, {
          cached_age_ms: cachedAge,
          amount: parsedAmount,
        });
      }
    }

    await auditLog(supabase, null, normalizedWallet, "controls_passed", {
      fight_id, fee_bps: effectiveFeeBps, slippage_bps: effectiveSlippage, is_polymarket: isPolymarketBacked,
    });

    // ═══════════════════════════════════════════════════
    // 5) CREATE INITIAL TRADE RECORD
    // ═══════════════════════════════════════════════════
    const { data: tradeOrder, error: tradeInsertErr } = await supabase
      .from("prediction_trade_orders")
      .insert({
        account_id: accountId,
        wallet: normalizedWallet,
        fight_id,
        prediction_event_id: fight.event_id || null,
        polymarket_market_id: fight.polymarket_market_id || null,
        token_id: tokenId,
        side: fighter_pick,
        order_type: "marketable_limit",
        requested_amount_usdc: parsedAmount,
        expected_price: expectedPrice,
        expected_shares: shares,
        fee_bps: effectiveFeeBps,
        fee_usdc: fee_usd,
        slippage_bps: effectiveSlippage,
        status: "requested",
      })
      .select("id")
      .single();

    if (tradeInsertErr) throw tradeInsertErr;
    tradeOrderId = tradeOrder.id;

    await auditLog(supabase, tradeOrderId, normalizedWallet, "trade_record_created", {
      requested_amount_usdc: parsedAmount, fee_usdc: fee_usd, net_amount_usdc: net_amount_usdc,
    });

    // ═══════════════════════════════════════════════════
    // 8) EXECUTION PATH
    // ═══════════════════════════════════════════════════
    let polymarket_order_id: string | null = null;
    let polymarket_status = "pending";
    let filledAmountUsdc = 0;
    let filledShares = 0;
    let avgFillPrice: number | null = null;
    let tradeStatus = "requested";

    if (isPolymarketBacked) {
      const walletLower = normalizedWallet;

      const { data: pmSession } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, pm_api_key, pm_api_secret, pm_passphrase, pm_derived_address, expires_at")
        .eq("wallet", walletLower)
        .maybeSingle();

      const isSessionValid = pmSession?.status === "active"
        && pmSession.pm_api_key
        && pmSession.pm_api_secret
        && pmSession.pm_passphrase
        && (!pmSession.expires_at || new Date(pmSession.expires_at) > new Date());

      if (isSessionValid && tokenId) {
        // Mark as submitted
        await updateTradeOrder(supabase, tradeOrderId, {
          status: "submitted",
          submitted_at: new Date().toISOString(),
        });
        tradeStatus = "submitted";

        await auditLog(supabase, tradeOrderId, normalizedWallet, "order_submit_started", {
          token_id: tokenId, price: expectedPrice, size: net_amount_usdc,
        });

        const orderResult = await submitClobOrder(
          {
            pm_api_key: pmSession!.pm_api_key!,
            pm_api_secret: pmSession!.pm_api_secret!,
            pm_passphrase: pmSession!.pm_passphrase!,
          },
          tokenId!,
          expectedPrice!,
          net_amount_usdc,
        );

        polymarket_order_id = orderResult.orderId;

        // Audit the result (no secrets)
        await auditLog(supabase, tradeOrderId, normalizedWallet, "order_submit_result", null, {
          order_id: orderResult.orderId,
          clob_status: orderResult.status,
          has_error: !!orderResult.error,
          error_snippet: orderResult.error ? orderResult.error.substring(0, 200) : null,
        });

        if (orderResult.orderId) {
          // Treat CLOB acceptance as filled for now (CLOB may partially fill async)
          polymarket_status = "submitted";
          tradeStatus = "filled";
          filledAmountUsdc = net_amount_usdc;
          filledShares = shares;
          avgFillPrice = expectedPrice;

          await updateTradeOrder(supabase, tradeOrderId, {
            status: "filled",
            polymarket_order_id: orderResult.orderId,
            filled_amount_usdc: filledAmountUsdc,
            filled_shares: filledShares,
            avg_fill_price: avgFillPrice,
            finalized_at: new Date().toISOString(),
          });

          // ── Post-submit targeted reconciliation (best-effort, 2s timeout) ──
          try {
            await auditLog(supabase, tradeOrderId, normalizedWallet, "post_submit_reconcile_started");

            const reconPath = `/order/${orderResult.orderId}`;
            const reconTs = Math.floor(Date.now() / 1000).toString();
            const reconHmac = await generateClobHmac(pmSession!.pm_api_secret!, reconTs, "GET", reconPath);

            const reconController = new AbortController();
            const reconTimeout = setTimeout(() => reconController.abort(), 2000);

            const reconRes = await fetch(`${CLOB_BASE}${reconPath}`, {
              headers: {
                "Content-Type": "application/json",
                POLY_API_KEY: pmSession!.pm_api_key!,
                POLY_SIGNATURE: reconHmac,
                POLY_PASSPHRASE: pmSession!.pm_passphrase!,
                POLY_TIMESTAMP: reconTs,
              },
              signal: reconController.signal,
            });
            clearTimeout(reconTimeout);

            if (reconRes.ok) {
              const clobOrder = await reconRes.json();
              const clobStatus = (clobOrder.status || "").toUpperCase();

              const reconUpdates: Record<string, unknown> = { reconciled_at: new Date().toISOString() };
              let reconStatusChanged = false;

              if (clobStatus === "MATCHED" || clobStatus === "FILLED") {
                const matchedSize = Number(clobOrder.size_matched ?? clobOrder.original_size ?? 0);
                const originalSize = Number(clobOrder.original_size ?? 0);
                const isPartial = originalSize > 0 && matchedSize < originalSize;
                const reconPrice = Number(clobOrder.price ?? clobOrder.average_price ?? 0);

                const newStatus = isPartial ? "partial_fill" : "filled";
                if (matchedSize > 0) {
                  reconUpdates.filled_shares = matchedSize;
                  reconUpdates.filled_amount_usdc = reconPrice > 0 ? matchedSize * reconPrice : filledAmountUsdc;
                  if (reconPrice > 0) reconUpdates.avg_fill_price = reconPrice;
                  filledShares = matchedSize;
                  filledAmountUsdc = Number(reconUpdates.filled_amount_usdc);
                  if (reconPrice > 0) avgFillPrice = reconPrice;
                }
                if (newStatus !== tradeStatus) {
                  reconUpdates.status = newStatus;
                  tradeStatus = newStatus;
                  reconStatusChanged = true;
                }
              } else if (clobStatus === "CANCELED" || clobStatus === "CANCELLED") {
                reconUpdates.status = "cancelled";
                reconUpdates.error_code = "clob_cancelled";
                reconUpdates.finalized_at = new Date().toISOString();
                tradeStatus = "cancelled";
                reconStatusChanged = true;
              } else if (clobStatus === "LIVE" || clobStatus === "OPEN") {
                reconUpdates.status = "submitted";
                tradeStatus = "submitted";
                reconStatusChanged = true;
              }

              await updateTradeOrder(supabase, tradeOrderId!, reconUpdates);
              await auditLog(supabase, tradeOrderId, normalizedWallet, "post_submit_reconcile_result", null, {
                clob_status: clobStatus, status_changed: reconStatusChanged, new_status: tradeStatus, filled_shares: filledShares,
              });
            } else {
              await auditLog(supabase, tradeOrderId, normalizedWallet, "post_submit_reconcile_failed", null, {
                reason: "clob_http_error", http_status: reconRes.status,
              });
            }
          } catch (reconErr: any) {
            const isTimeout = reconErr?.name === "AbortError";
            await auditLog(supabase, tradeOrderId, normalizedWallet, "post_submit_reconcile_failed", null, {
              reason: isTimeout ? "timeout" : "exception", message: reconErr?.message?.substring(0, 200) ?? "unknown",
            });
          }
        } else {
          // CLOB rejection
          polymarket_status = orderResult.status;
          tradeStatus = "failed";

          await updateTradeOrder(supabase, tradeOrderId, {
            status: "failed",
            error_code: "clob_rejected",
            error_message: orderResult.error ? orderResult.error.substring(0, 500) : "CLOB order rejected",
            finalized_at: new Date().toISOString(),
          });

          await auditLog(supabase, tradeOrderId, normalizedWallet, "trade_failed", null, {
            reason: "clob_rejected", clob_status: orderResult.status,
          });

          return json({
            error: "Order was rejected by the exchange",
            trade_order_id: tradeOrderId,
            trade_status: "failed",
          }, 502);
        }

        console.log(`[prediction-submit] Polymarket order: user=${walletLower}, token=${tokenId}, amount=$${net_amount_usdc}, price=${expectedPrice}, status=${polymarket_status}`);
      } else {
        // Deferred: user needs PM auth
        polymarket_status = "awaiting_user_auth";
        tradeStatus = "requested";

        await updateTradeOrder(supabase, tradeOrderId, {
          status: "requested",
          error_code: "awaiting_user_auth",
        });

        console.log(`[prediction-submit] Polymarket deferred: user=${walletLower} needs PM auth`);
      }
    } else {
      // Native 1MGAMING event — mark as filled immediately (local pool)
      tradeStatus = "filled";
      filledAmountUsdc = net_amount_usdc;
      filledShares = shares;

      await updateTradeOrder(supabase, tradeOrderId, {
        status: "filled",
        filled_amount_usdc: filledAmountUsdc,
        filled_shares: filledShares,
        finalized_at: new Date().toISOString(),
      });
    }

    // ═══════════════════════════════════════════════════
    // 9) COMPATIBILITY: LEGACY prediction_entries INSERT
    // ═══════════════════════════════════════════════════
    const { data: entry, error: insertErr } = await supabase
      .from("prediction_entries")
      .insert({
        fight_id,
        wallet: normalizedWallet,
        fighter_pick,
        amount_usd: parsedAmount,
        fee_usd,
        pool_usd: net_amount_usdc,
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

    // ── Update fight pool totals (legacy compat) ──
    const { error: updateErr } = await supabase.rpc("prediction_update_pool_usd", {
      p_fight_id: fight_id,
      p_pool_usd: net_amount_usdc,
      p_shares: shares,
      p_side: fighter_pick,
    });

    if (updateErr) {
      const poolCol = fighter_pick === "fighter_a" ? "pool_a_usd" : "pool_b_usd";
      const sharesCol = fighter_pick === "fighter_a" ? "shares_a" : "shares_b";
      const newPoolVal = (fighter_pick === "fighter_a" ? fight.pool_a_usd : fight.pool_b_usd) + net_amount_usdc;
      const newSharesVal = (fighter_pick === "fighter_a" ? fight.shares_a : fight.shares_b) + shares;

      await supabase
        .from("prediction_fights")
        .update({ [poolCol]: newPoolVal, [sharesCol]: newSharesVal })
        .eq("id", fight_id);
    }

    // ═══════════════════════════════════════════════════
    // FINAL AUDIT + RESPONSE
    // ═══════════════════════════════════════════════════
    await auditLog(supabase, tradeOrderId, normalizedWallet, "trade_finalized", null, {
      trade_status: tradeStatus, entry_id: entry?.id,
    });

    return json({
      success: true,
      // New canonical fields
      trade_order_id: tradeOrderId,
      trade_status: tradeStatus,
      requested_amount_usdc: parsedAmount,
      fee_usdc: fee_usd,
      net_amount_usdc,
      fee_bps: effectiveFeeBps,
      // Legacy compat fields
      entry,
      pool_contribution_usd: net_amount_usdc,
      commission_bps: effectiveFeeBps,
      source: fight.source || "manual",
      shares,
      polymarket_backed: isPolymarketBacked,
      polymarket_status: isPolymarketBacked ? polymarket_status : undefined,
      polymarket_order_id: polymarket_order_id || undefined,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Best-effort: update trade order and audit on unexpected error
    if (tradeOrderId) {
      await updateTradeOrder(supabase, tradeOrderId, {
        status: "failed",
        error_code: "internal_error",
        error_message: errorMsg.substring(0, 500),
        finalized_at: new Date().toISOString(),
      });
    }
    await auditLog(supabase, tradeOrderId, normalizedWallet, "trade_failed", null, {
      reason: "internal_error", message: errorMsg.substring(0, 300),
    });

    return json({ error: errorMsg, trade_order_id: tradeOrderId }, 500);
  }
});
