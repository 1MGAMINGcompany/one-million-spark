import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import { privateKeyToAccount } from "viem/accounts";

/**
 * prediction-submit — Production trade execution gateway.
 *
 * Polymarket-backed events: EIP-712 signed orders via user's CLOB credentials
 * Native 1MGAMING events: Local pool accounting only
 *
 * Lifecycle: requested → submitted → filled/partial_fill/failed
 * Explicit fee model: fee collected via Privy server-side USDC transfer to treasury.
 * Builder wallet is NEVER used as the user's trading identity.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// ── Polymarket CTF Exchange (Polygon mainnet) ──────────────
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const POLYGON_CHAIN_ID = 137;
const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";
const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_DECIMALS = 6;

/** EIP-712 domain for Polymarket CTF Exchange orders */
const EIP712_DOMAIN = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: CTF_EXCHANGE as `0x${string}`,
} as const;

/** EIP-712 typed data structure for Polymarket orders */
const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Helpers ──────────────────────────────────────────────

/** HMAC signature for Polymarket L2 API authentication headers */
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
 * Build an EIP-712 signed Polymarket CLOB order and submit it.
 * Uses the user's derived trading key for order signing and L2 HMAC for API auth.
 */
async function buildAndSubmitClobOrder(
  session: {
    pm_api_key: string;
    pm_api_secret: string;
    pm_passphrase: string;
    pm_trading_key: string;
  },
  tokenId: string,
  price: number,
  netAmountUsdc: number,
): Promise<{ orderId: string | null; status: string; error?: string }> {
  try {
    const account = privateKeyToAccount(session.pm_trading_key as `0x${string}`);

    // Calculate raw amounts (6 decimal precision, matching Polymarket's USDC.e / CT)
    const makerAmountRaw = BigInt(Math.floor(netAmountUsdc * 10 ** USDC_DECIMALS));
    const shares = netAmountUsdc / price;
    const takerAmountRaw = BigInt(Math.floor(shares * 10 ** USDC_DECIMALS));

    // Generate cryptographic salt for order uniqueness
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = BigInt(
      "0x" + Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join(""),
    );

    const orderMessage = {
      salt,
      maker: account.address as `0x${string}`,
      signer: account.address as `0x${string}`,
      taker: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      tokenId: BigInt(tokenId),
      makerAmount: makerAmountRaw,
      takerAmount: takerAmountRaw,
      expiration: 0n,
      nonce: 0n,
      feeRateBps: 0n,
      side: 0, // BUY
      signatureType: 0, // EOA
    };

    // EIP-712 sign the order with the derived trading key
    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: ORDER_TYPES,
      primaryType: "Order",
      message: orderMessage,
    });

    // Build POST /order body matching Polymarket CLOB format
    const orderBody = JSON.stringify({
      order: {
        salt: salt.toString(),
        maker: account.address,
        signer: account.address,
        taker: "0x0000000000000000000000000000000000000000",
        tokenID: tokenId,
        makerAmount: makerAmountRaw.toString(),
        takerAmount: takerAmountRaw.toString(),
        expiration: "0",
        nonce: "0",
        feeRateBps: "0",
        side: "BUY",
        signatureType: 0,
        signature,
      },
      owner: account.address,
      orderType: "GTC",
    });

    // L2 HMAC authentication headers
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = "/order";
    const hmac = await generateClobHmac(session.pm_api_secret, timestamp, "POST", path, orderBody);

    const res = await fetch(`${CLOB_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        POLY_API_KEY: session.pm_api_key,
        POLY_SIGNATURE: hmac,
        POLY_PASSPHRASE: session.pm_passphrase,
        POLY_TIMESTAMP: timestamp,
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
  } catch (err) {
    console.error("[prediction-submit] EIP-712 order signing/submission failed:", err);
    return {
      orderId: null,
      status: "signing_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Transfer USDC fee from user's Privy embedded wallet to treasury.
 * Uses Privy server-side wallet API (requires PRIVY_APP_SECRET).
 */
async function transferFeeViaPrivy(
  privyDid: string,
  feeUsdc: number,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const appId = Deno.env.get("VITE_PRIVY_APP_ID");
  const appSecret = Deno.env.get("PRIVY_APP_SECRET");

  if (!appId || !appSecret) {
    return { success: false, error: "privy_server_not_configured" };
  }

  try {
    const basicAuth = btoa(`${appId}:${appSecret}`);

    // Step 1: Look up user's Privy wallet ID from DID
    const userRes = await fetch(`https://api.privy.io/v1/users/${privyDid}`, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "privy-app-id": appId,
      },
    });

    if (!userRes.ok) {
      const errBody = await userRes.text();
      return {
        success: false,
        error: `privy_user_lookup_failed_${userRes.status}: ${errBody.substring(0, 200)}`,
      };
    }

    const userData = await userRes.json();
    const embeddedWallet = userData.linked_accounts?.find(
      (a: any) =>
        a.type === "wallet" &&
        a.wallet_client_type === "privy" &&
        a.chain_type === "ethereum",
    );

    if (!embeddedWallet?.id) {
      return { success: false, error: "privy_wallet_not_found" };
    }

    // SECURITY GATE: Privy user-owned embedded wallets (owner_id present)
    // require a user authorization signature header for server-side RPC.
    // Basic auth alone is NOT sufficient per Privy docs:
    // "Wallets with owner_id present must provide an authorization signature."
    // We cannot produce this signature server-side without the user's key material.
    // Fail closed until a client-side authorization flow is implemented.
    const hasOwnerId = !!embeddedWallet.owner_id;
    if (hasOwnerId) {
      return {
        success: false,
        error: "privy_user_authorization_required",
      };
    }

    // Step 2: Encode ERC20 transfer(address,uint256) calldata
    const feeRaw = BigInt(Math.floor(feeUsdc * 10 ** USDC_DECIMALS));
    const transferSelector = "a9059cbb";
    const paddedTo = TREASURY_WALLET.slice(2).toLowerCase().padStart(64, "0");
    const paddedAmount = feeRaw.toString(16).padStart(64, "0");
    const calldata = `0x${transferSelector}${paddedTo}${paddedAmount}`;

    // Step 3: Execute USDC transfer via Privy server-side wallet API
    const txRes = await fetch(
      `https://api.privy.io/v1/wallets/${embeddedWallet.id}/rpc`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "privy-app-id": appId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: "eth_sendTransaction",
          caip2: "eip155:137", // Polygon mainnet
          chain_type: "ethereum",
          params: {
            transaction: {
              to: USDC_CONTRACT,
              data: calldata,
              value: "0x0",
            },
          },
        }),
      },
    );

    if (!txRes.ok) {
      const errText = await txRes.text();
      return {
        success: false,
        error: `privy_tx_failed_${txRes.status}: ${errText.substring(0, 200)}`,
      };
    }

    const txData = await txRes.json();
    const txHash = txData.data?.hash || txData.data?.transaction_hash || txData.hash || null;
    return { success: true, txHash };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

  // ── REQUIRED Privy JWT verification for identity binding ──
  let privyDid: string | null = null;
  let privyEmbeddedWalletAddress: string | null = null;
  {
    const privyToken = req.headers.get("x-privy-token");
    const appId = Deno.env.get("VITE_PRIVY_APP_ID");
    const appSecret = Deno.env.get("PRIVY_APP_SECRET");

    if (!privyToken || privyToken.length < 20 || !appId) {
      await auditLog(supabase, null, null, "auth_required_failed", null, {
        reason: !privyToken ? "missing_privy_token" : !appId ? "missing_app_id" : "token_too_short",
      });
      return json({ error: "Authentication required", error_code: "auth_required" }, 401);
    }

    try {
      const jwks = createRemoteJWKSet(
        new URL("https://auth.privy.io/.well-known/jwks.json"),
      );
      const { payload } = await jwtVerify(privyToken, jwks, {
        issuer: "privy.io",
        audience: appId,
      });
      privyDid = (payload.sub as string) || null;
    } catch (e) {
      await auditLog(supabase, null, null, "auth_required_failed", null, {
        reason: "jwt_verification_failed",
        error: (e as Error).message,
      });
      return json({ error: "Authentication failed", error_code: "auth_failed" }, 401);
    }

    if (!privyDid) {
      await auditLog(supabase, null, null, "auth_required_failed", null, {
        reason: "no_did_in_token",
      });
      return json({ error: "Authentication failed — no identity", error_code: "auth_no_did" }, 401);
    }

    // Fetch the authenticated user's embedded wallet from Privy
    if (appId && appSecret) {
      try {
        const basicAuth = btoa(`${appId}:${appSecret}`);
        const userRes = await fetch(`https://api.privy.io/v1/users/${privyDid}`, {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "privy-app-id": appId,
          },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          const embeddedWallet = userData.linked_accounts?.find(
            (a: any) =>
              a.type === "wallet" &&
              a.wallet_client_type === "privy" &&
              a.chain_type === "ethereum",
          );
          if (embeddedWallet?.address) {
            privyEmbeddedWalletAddress = String(embeddedWallet.address).trim().toLowerCase();
          }
        }
      } catch (e) {
        console.warn("[prediction-submit] Privy wallet lookup failed:", (e as Error).message);
      }
    }
  }

  try {
    const body = await req.json();
    const {
      fight_id,
      wallet,
      fighter_pick,
      amount_usd,
      slippage_bps: clientSlippage,
    } = body;

    normalizedWallet = wallet ? String(wallet).trim().toLowerCase() : null;

    // ── WALLET VERIFICATION: client wallet must match Privy embedded wallet ──
    if (privyEmbeddedWalletAddress && normalizedWallet !== privyEmbeddedWalletAddress) {
      await auditLog(supabase, null, normalizedWallet, "wallet_mismatch", null, {
        submitted_wallet: normalizedWallet,
        privy_wallet: privyEmbeddedWalletAddress,
        privy_did: privyDid,
      });
      return json({ error: "Wallet does not match authenticated user", error_code: "wallet_mismatch" }, 403);
    }

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
    // 2) RESOLVE USER ACCOUNT (with Privy DID binding)
    // ═══════════════════════════════════════════════════
    let accountId: string | null = null;
    {
      let existing: { id: string } | null = null;
      if (privyDid) {
        const { data } = await supabase
          .from("prediction_accounts")
          .select("id")
          .eq("privy_did", privyDid)
          .maybeSingle();
        existing = data;
      }
      if (!existing) {
        const { data } = await supabase
          .from("prediction_accounts")
          .select("id")
          .eq("wallet_evm", normalizedWallet)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        accountId = existing.id;
        const updatePayload: Record<string, unknown> = {
          last_active_at: new Date().toISOString(),
          wallet_evm: normalizedWallet,
        };
        if (privyDid) updatePayload.privy_did = privyDid;
        await supabase
          .from("prediction_accounts")
          .update(updatePayload)
          .eq("id", accountId);
      } else {
        const insertPayload: Record<string, unknown> = {
          wallet_evm: normalizedWallet,
          auth_provider: "privy",
        };
        if (privyDid) insertPayload.privy_did = privyDid;
        const { data: created } = await supabase
          .from("prediction_accounts")
          .insert(insertPayload)
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
        (sum: number, o: { requested_amount_usdc: number }) =>
          sum + Number(o.requested_amount_usdc),
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
      const errorCode =
        fight.status === "locked"
          ? "market_locked"
          : fight.status === "live"
            ? "market_locked"
            : fight.status === "settled" || fight.status === "confirmed"
              ? "market_settled"
              : fight.status === "cancelled"
                ? "market_cancelled"
                : "market_not_tradable";

      await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id, fight_status: fight.status }, { error_code: errorCode });
      return json({ error: "This market is no longer open for predictions", error_code: errorCode, fight_status: fight.status }, 400);
    }

    // ═══════════════════════════════════════════════════
    // MARKET ALLOWLIST ENFORCEMENT
    // ═══════════════════════════════════════════════════
    const marketMode = controls?.allowed_market_mode ?? "all";

    if (marketMode === "none") {
      await auditLog(supabase, null, normalizedWallet, "trade_failed", { fight_id }, { reason: "trading_disabled_by_policy", mode: "none" });
      return json({ error: "All trading is currently disabled by policy", error_code: "trading_disabled_by_policy" }, 403);
    }

    if (marketMode === "allowlist" && !fight.trading_allowed) {
      await auditLog(supabase, null, normalizedWallet, "trade_failed", { fight_id }, { reason: "market_not_allowlisted", mode: "allowlist" });
      return json({ error: "This market is not currently enabled for trading", error_code: "market_not_allowlisted" }, 403);
    }

    // ═══════════════════════════════════════════════════
    // SOURCE-AWARE ROUTING PREP
    // ═══════════════════════════════════════════════════
    const isPolymarketBacked = !!(
      fight.polymarket_market_id && fight.polymarket_outcome_a_token
    );

    const tokenId = isPolymarketBacked
      ? fighter_pick === "fighter_a"
        ? fight.polymarket_outcome_a_token
        : fight.polymarket_outcome_b_token
      : null;

    // ═══════════════════════════════════════════════════
    // POLYMARKET-SPECIFIC VALIDATIONS
    // ═══════════════════════════════════════════════════
    if (isPolymarketBacked) {
      if (!fight.polymarket_market_id) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id }, { error_code: "missing_market_mapping", field: "polymarket_market_id" });
        return json({ error: "Market configuration incomplete", error_code: "missing_market_mapping" }, 400);
      }
      if (!tokenId) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id, fighter_pick }, { error_code: "missing_market_mapping", field: "token_id" });
        return json({ error: "Market token configuration incomplete for this outcome", error_code: "missing_market_mapping" }, 400);
      }

      if (fight.polymarket_active === false) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id }, { error_code: "market_inactive" });
        return json({ error: "This Polymarket market is no longer active", error_code: "market_inactive" }, 400);
      }

      if (
        fight.polymarket_end_date &&
        new Date(fight.polymarket_end_date) <= new Date()
      ) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id }, { error_code: "market_expired", end_date: fight.polymarket_end_date });
        return json({ error: "This market has expired", error_code: "market_expired" }, 400);
      }

      const lastSynced = fight.polymarket_last_synced_at
        ? new Date(fight.polymarket_last_synced_at).getTime()
        : 0;
      const priceAge = Date.now() - lastSynced;
      if (lastSynced === 0 || priceAge > MAX_PRICE_STALENESS_MS) {
        await auditLog(supabase, null, normalizedWallet, "stale_quote_rejected", { fight_id }, {
          error_code: "stale_quote",
          price_age_ms: priceAge,
          threshold_ms: MAX_PRICE_STALENESS_MS,
          last_synced: fight.polymarket_last_synced_at || "never",
        });
        return json({ error: "Market price data is stale. Please try again shortly.", error_code: "stale_quote" }, 400);
      }
    }

    // ═══════════════════════════════════════════════════
    // 6) EXPLICIT FEE MODEL
    // ═══════════════════════════════════════════════════
    const systemFeeBps = controls
      ? Number(controls.default_fee_bps)
      : LEGACY_DEFAULT_FEE_BPS;
    const effectiveFeeBps =
      fight.commission_bps != null
        ? Number(fight.commission_bps)
        : systemFeeBps;
    const fee_usd = Number(
      ((parsedAmount * effectiveFeeBps) / 10_000).toFixed(6),
    );
    const net_amount_usdc = Number((parsedAmount - fee_usd).toFixed(6));
    const shares = Math.floor(net_amount_usdc * 100);

    // Slippage: use client value capped by system max
    const systemMaxSlippage = controls
      ? Number(controls.max_slippage_bps)
      : 300;
    const effectiveSlippage =
      clientSlippage != null
        ? Math.min(Number(clientSlippage), systemMaxSlippage)
        : systemMaxSlippage;

    // Expected price from cached data
    const expectedPrice = isPolymarketBacked
      ? Number(
          fighter_pick === "fighter_a"
            ? fight.price_a || 0.5
            : fight.price_b || 0.5,
        )
      : null;

    // ═══════════════════════════════════════════════════
    // SLIPPAGE CHECK — fetch live price and compare
    // ═══════════════════════════════════════════════════
    if (
      isPolymarketBacked &&
      tokenId &&
      expectedPrice != null &&
      expectedPrice > 0
    ) {
      try {
        const priceRes = await fetch(
          `${CLOB_BASE}/price?token_id=${tokenId}&side=BUY`,
        );
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const livePrice = parseFloat(priceData?.price || "0");

          if (livePrice > 0) {
            const slippageBps =
              (Math.abs(livePrice - expectedPrice) / expectedPrice) * 10_000;
            if (slippageBps > effectiveSlippage) {
              await auditLog(supabase, null, normalizedWallet, "slippage_rejected", { fight_id, token_id: tokenId }, {
                error_code: "slippage_exceeded",
                expected_price: expectedPrice,
                live_price: livePrice,
                slippage_bps: Math.round(slippageBps),
                max_slippage_bps: effectiveSlippage,
              });
              return json(
                {
                  error: "Price has moved beyond acceptable range. Please retry.",
                  error_code: "slippage_exceeded",
                  expected_price: expectedPrice,
                  live_price: livePrice,
                },
                400,
              );
            }
          } else {
            throw new Error("live_price_zero");
          }
        } else {
          throw new Error(`clob_http_${priceRes.status}`);
        }
      } catch (slipErr) {
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
          return json(
            {
              error: "Live pricing unavailable. Please try again in a moment.",
              error_code: "live_price_unavailable",
            },
            503,
          );
        }

        await auditLog(supabase, null, normalizedWallet, "cached_price_fallback_allowed", { fight_id }, {
          cached_age_ms: cachedAge,
          amount: parsedAmount,
        });
      }
    }

    await auditLog(supabase, null, normalizedWallet, "controls_passed", {
      fight_id,
      fee_bps: effectiveFeeBps,
      slippage_bps: effectiveSlippage,
      is_polymarket: isPolymarketBacked,
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
      requested_amount_usdc: parsedAmount,
      fee_usdc: fee_usd,
      net_amount_usdc: net_amount_usdc,
    });

    // ═══════════════════════════════════════════════════
    // 7) FEE TRANSFER — collect before execution
    // ═══════════════════════════════════════════════════
    let feeCollected = false;
    let feeTxHash: string | null = null;

    if (fee_usd > 0.01) {
      await auditLog(supabase, tradeOrderId, normalizedWallet, "fee_transfer_started", {
        fee_usdc: fee_usd,
        treasury: TREASURY_WALLET,
      });

      const feeResult = await transferFeeViaPrivy(privyDid!, fee_usd);

      if (feeResult.success) {
        feeCollected = true;
        feeTxHash = feeResult.txHash || null;
        await auditLog(supabase, tradeOrderId, normalizedWallet, "fee_transfer_success", null, {
          tx_hash: feeTxHash,
          fee_usdc: fee_usd,
        });
      } else {
        // Distinguish privy_user_authorization_required from generic fee failures
        const isAuthRequired = feeResult.error === "privy_user_authorization_required";
        const auditAction = isAuthRequired ? "privy_wallet_auth_required" : "fee_required_but_failed";
        const errorCode = isAuthRequired ? "privy_user_authorization_required" : "fee_transfer_failed";

        await auditLog(supabase, tradeOrderId, normalizedWallet, auditAction, null, {
          error: feeResult.error,
          fee_usdc: fee_usd,
        });

        await updateTradeOrder(supabase, tradeOrderId, {
          status: "failed",
          error_code: errorCode,
          error_message: feeResult.error?.substring(0, 500),
          finalized_at: new Date().toISOString(),
        });

        return json(
          {
            error: isAuthRequired
              ? "User wallet authorization required for fee transfer. Client-side signing flow needed."
              : "Fee transfer failed. Trade aborted.",
            error_code: errorCode,
            trade_order_id: tradeOrderId,
          },
          isAuthRequired ? 501 : 502,
        );
      }
    }

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
        .select(
          "id, status, pm_api_key, pm_api_secret, pm_passphrase, pm_trading_key, pm_derived_address, expires_at",
        )
        .eq("wallet", walletLower)
        .maybeSingle();

      const isSessionValid =
        pmSession?.status === "active" &&
        pmSession.pm_api_key &&
        pmSession.pm_api_secret &&
        pmSession.pm_passphrase &&
        pmSession.pm_trading_key &&
        (!pmSession.expires_at ||
          new Date(pmSession.expires_at) > new Date());

      if (isSessionValid && tokenId) {
        // Mark as submitted
        await updateTradeOrder(supabase, tradeOrderId, {
          status: "submitted",
          submitted_at: new Date().toISOString(),
        });
        tradeStatus = "submitted";

        await auditLog(supabase, tradeOrderId, normalizedWallet, "order_submit_started", {
          token_id: tokenId,
          price: expectedPrice,
          size: net_amount_usdc,
          fee_collected: feeCollected,
          fee_tx_hash: feeTxHash,
        });

        // ── EIP-712 signed CLOB order submission ──
        const orderResult = await buildAndSubmitClobOrder(
          {
            pm_api_key: pmSession!.pm_api_key!,
            pm_api_secret: pmSession!.pm_api_secret!,
            pm_passphrase: pmSession!.pm_passphrase!,
            pm_trading_key: pmSession!.pm_trading_key!,
          },
          tokenId!,
          expectedPrice!,
          net_amount_usdc,
        );

        polymarket_order_id = orderResult.orderId;

        await auditLog(supabase, tradeOrderId, normalizedWallet, "order_submit_result", null, {
          order_id: orderResult.orderId,
          clob_status: orderResult.status,
          has_error: !!orderResult.error,
          error_snippet: orderResult.error
            ? orderResult.error.substring(0, 200)
            : null,
        });

        if (orderResult.orderId) {
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
            const reconHmac = await generateClobHmac(
              pmSession!.pm_api_secret!,
              reconTs,
              "GET",
              reconPath,
            );

            const reconController = new AbortController();
            const reconTimeout = setTimeout(
              () => reconController.abort(),
              2000,
            );

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

              const reconUpdates: Record<string, unknown> = {
                reconciled_at: new Date().toISOString(),
              };
              let reconStatusChanged = false;

              if (clobStatus === "MATCHED" || clobStatus === "FILLED") {
                const matchedSize = Number(
                  clobOrder.size_matched ?? clobOrder.original_size ?? 0,
                );
                const originalSize = Number(clobOrder.original_size ?? 0);
                const isPartial =
                  originalSize > 0 && matchedSize < originalSize;
                const reconPrice = Number(
                  clobOrder.price ?? clobOrder.average_price ?? 0,
                );

                const newStatus = isPartial ? "partial_fill" : "filled";
                if (matchedSize > 0) {
                  reconUpdates.filled_shares = matchedSize;
                  reconUpdates.filled_amount_usdc =
                    reconPrice > 0
                      ? matchedSize * reconPrice
                      : filledAmountUsdc;
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
              } else if (
                clobStatus === "CANCELED" ||
                clobStatus === "CANCELLED"
              ) {
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
                clob_status: clobStatus,
                status_changed: reconStatusChanged,
                new_status: tradeStatus,
                filled_shares: filledShares,
              });
            } else {
              await auditLog(supabase, tradeOrderId, normalizedWallet, "post_submit_reconcile_failed", null, {
                reason: "clob_http_error",
                http_status: reconRes.status,
              });
            }
          } catch (reconErr: any) {
            const isTimeout = reconErr?.name === "AbortError";
            await auditLog(supabase, tradeOrderId, normalizedWallet, "post_submit_reconcile_failed", null, {
              reason: isTimeout ? "timeout" : "exception",
              message:
                reconErr?.message?.substring(0, 200) ?? "unknown",
            });
          }
        } else {
          // CLOB rejection
          polymarket_status = orderResult.status;
          tradeStatus = "failed";

          await updateTradeOrder(supabase, tradeOrderId, {
            status: "failed",
            error_code: "clob_rejected",
            error_message: orderResult.error
              ? orderResult.error.substring(0, 500)
              : "CLOB order rejected",
            finalized_at: new Date().toISOString(),
          });

          await auditLog(supabase, tradeOrderId, normalizedWallet, "trade_failed", null, {
            reason: "clob_rejected",
            clob_status: orderResult.status,
          });

          return json(
            {
              error: "Order was rejected by the exchange",
              trade_order_id: tradeOrderId,
              trade_status: "failed",
            },
            502,
          );
        }

        console.log(
          `[prediction-submit] Polymarket order: user=${walletLower}, token=${tokenId}, amount=$${net_amount_usdc}, price=${expectedPrice}, status=${polymarket_status}, fee_collected=${feeCollected}`,
        );
      } else {
        // Deferred: user needs PM auth or trading key
        polymarket_status = "awaiting_user_auth";
        tradeStatus = "requested";

        const missingField = !pmSession
          ? "no_session"
          : !pmSession.pm_trading_key
            ? "no_trading_key"
            : "session_invalid";

        await updateTradeOrder(supabase, tradeOrderId, {
          status: "requested",
          error_code: "awaiting_user_auth",
        });

        await auditLog(supabase, tradeOrderId, normalizedWallet, "deferred_awaiting_auth", null, {
          missing: missingField,
        });

        console.log(
          `[prediction-submit] Polymarket deferred: user=${walletLower} needs PM auth (${missingField})`,
        );
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
    const { error: updateErr } = await supabase.rpc(
      "prediction_update_pool_usd",
      {
        p_fight_id: fight_id,
        p_pool_usd: net_amount_usdc,
        p_shares: shares,
        p_side: fighter_pick,
      },
    );

    if (updateErr) {
      const poolCol =
        fighter_pick === "fighter_a" ? "pool_a_usd" : "pool_b_usd";
      const sharesCol =
        fighter_pick === "fighter_a" ? "shares_a" : "shares_b";
      const newPoolVal =
        (fighter_pick === "fighter_a"
          ? fight.pool_a_usd
          : fight.pool_b_usd) + net_amount_usdc;
      const newSharesVal =
        (fighter_pick === "fighter_a" ? fight.shares_a : fight.shares_b) +
        shares;

      await supabase
        .from("prediction_fights")
        .update({ [poolCol]: newPoolVal, [sharesCol]: newSharesVal })
        .eq("id", fight_id);
    }

    // ═══════════════════════════════════════════════════
    // FINAL AUDIT + RESPONSE
    // ═══════════════════════════════════════════════════
    await auditLog(supabase, tradeOrderId, normalizedWallet, "trade_finalized", null, {
      trade_status: tradeStatus,
      entry_id: entry?.id,
      fee_collected: feeCollected,
      fee_tx_hash: feeTxHash,
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

    if (tradeOrderId) {
      await updateTradeOrder(supabase, tradeOrderId, {
        status: "failed",
        error_code: "internal_error",
        error_message: errorMsg.substring(0, 500),
        finalized_at: new Date().toISOString(),
      });
    }
    await auditLog(supabase, tradeOrderId, normalizedWallet, "trade_failed", null, {
      reason: "internal_error",
      message: errorMsg.substring(0, 300),
    });

    return json({ error: errorMsg, trade_order_id: tradeOrderId }, 500);
  }
});
