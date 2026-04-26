import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "npm:viem@2/accounts";

/**
 * prediction-sell — Sell an existing prediction position on the Polymarket CLOB.
 *
 * Accepts { fight_id, wallet } with Privy auth via x-privy-token.
 * Looks up the user's filled BUY position and submits a SELL order (side: 1).
 * Uses shared credentials fallback if no per-user session exists.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
function getClobUrl(): string { return Deno.env.get("CLOB_PROXY_URL") || CLOB_BASE; }
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const POLYGON_CHAIN_ID = 137;
const USDC_DECIMALS = 6;

const EIP712_DOMAIN = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: CTF_EXCHANGE as `0x${string}`,
} as const;

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

/** Decode a base64 (or URL-safe base64) string to Uint8Array */
function base64ToUint8Array(b64: string): Uint8Array {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - std.length % 4) % 4);
  const bin = atob(padded);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/** HMAC signature for Polymarket L2 API authentication headers.
 *  The apiSecret is base64-encoded — must be decoded before use as HMAC key. */
async function generateClobHmac(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = "",
): Promise<string> {
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();
  const secretBytes = base64ToUint8Array(apiSecret);
  const keyData = new Uint8Array(secretBytes.byteLength);
  keyData.set(secretBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Fetch current SELL price from CLOB for a given token.
 */
async function getSellPrice(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${getClobUrl()}/price?token_id=${tokenId}&side=sell`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.price ? Number(data.price) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Privy JWT verification ──
  let privyDid: string | null = null;
  {
    const privyToken = req.headers.get("x-privy-token");
    const appId = Deno.env.get("VITE_PRIVY_APP_ID");

    if (!privyToken || privyToken.length < 20 || !appId) {
      return json({ error: "Authentication required", error_code: "auth_required" }, 401);
    }

    try {
      const parts = privyToken.split(".");
      if (parts.length !== 3) throw new Error("malformed_jwt");

      const headerB64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
      const header = JSON.parse(atob(headerB64));
      const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jwtPayload = JSON.parse(atob(payloadB64));

      const now = Math.floor(Date.now() / 1000);
      if (jwtPayload.exp && jwtPayload.exp < now) throw new Error("token_expired");
      if (jwtPayload.iss !== "privy.io") throw new Error("invalid_issuer");
      if (jwtPayload.aud !== appId) throw new Error("invalid_audience");

      const jwksUrl = `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`;
      const jwksRes = await fetch(jwksUrl);
      if (!jwksRes.ok) throw new Error("jwks_fetch_failed");
      const { keys } = await jwksRes.json();

      const matchingKey = keys.find((k: any) => k.kid === header.kid);
      if (!matchingKey) throw new Error("unknown_signing_key");

      const alg = matchingKey.kty === "EC"
        ? { name: "ECDSA", namedCurve: matchingKey.crv || "P-256" }
        : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      const verifyAlg = matchingKey.kty === "EC"
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5" };

      const cryptoKey = await crypto.subtle.importKey("jwk", matchingKey, alg, false, ["verify"]);
      const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const sigB64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
      const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));

      const valid = await crypto.subtle.verify(verifyAlg, cryptoKey, sig, data);
      if (!valid) throw new Error("invalid_jwt_signature");

      privyDid = (jwtPayload.sub as string) || null;
      if (!privyDid) throw new Error("no_did_in_token");
    } catch (e) {
      return json({ error: "Authentication failed", error_code: "auth_failed" }, 401);
    }
  }

  try {
    const body = await req.json();
    const { fight_id, wallet } = body;

    if (!fight_id || !wallet) {
      return json({ error: "Missing required fields (fight_id, wallet)" }, 400);
    }

    const normalizedWallet = wallet.trim().toLowerCase();

    // Look up the user's filled BUY trade order
    const { data: buyOrder, error: buyErr } = await supabase
      .from("prediction_trade_orders")
      .select("*")
      .eq("fight_id", fight_id)
      .eq("wallet", normalizedWallet)
      .eq("side", "BUY")
      .in("status", ["filled", "submitted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (buyErr || !buyOrder) {
      return json({ error: "No active position found for this market", error_code: "no_position" }, 404);
    }

    if (!buyOrder.token_id) {
      return json({ error: "Position has no token ID — cannot sell", error_code: "no_token_id" }, 400);
    }

    // Check if already sold
    const { data: existingSell } = await supabase
      .from("prediction_trade_orders")
      .select("id")
      .eq("fight_id", fight_id)
      .eq("wallet", normalizedWallet)
      .eq("side", "SELL")
      .in("status", ["filled", "submitted"])
      .limit(1)
      .maybeSingle();

    if (existingSell) {
      return json({ error: "Position already sold", error_code: "already_sold" }, 400);
    }

    // Check fight is still tradeable
    const { data: fight } = await supabase
      .from("prediction_fights")
      .select("status, polymarket_active")
      .eq("id", fight_id)
      .single();

    if (!fight || !["open", "live", "locked"].includes(fight.status)) {
      return json({ error: "Market is no longer open for trading", error_code: "market_closed" }, 400);
    }

    // Get current sell price
    const sellPrice = await getSellPrice(buyOrder.token_id);
    if (!sellPrice || sellPrice <= 0) {
      return json({ error: "Could not fetch current sell price", error_code: "price_unavailable" }, 503);
    }

    // Resolve credentials — per-user session ONLY (no shared fallback)
    let session: { pm_api_key: string; pm_api_secret: string; pm_passphrase: string; pm_trading_key: string } | null = null;

    const { data: userSession } = await supabase
      .from("polymarket_user_sessions")
      .select("*")
      .eq("wallet", normalizedWallet)
      .eq("status", "active")
      .maybeSingle();

    if (userSession?.pm_api_key && userSession?.pm_api_secret && userSession?.pm_passphrase && userSession?.pm_trading_key) {
      session = {
        pm_api_key: userSession.pm_api_key,
        pm_api_secret: userSession.pm_api_secret,
        pm_passphrase: userSession.pm_passphrase,
        pm_trading_key: userSession.pm_trading_key,
      };
    }

    if (!session) {
      return json({ error: "No trading credentials available", error_code: "no_credentials" }, 503);
    }

    // Build SELL order
    const shares = buyOrder.filled_shares || buyOrder.expected_shares || 0;
    if (shares <= 0) {
      return json({ error: "No shares to sell", error_code: "no_shares" }, 400);
    }

    const account = privateKeyToAccount(session.pm_trading_key as `0x${string}`);

    // For SELL: makerAmount = shares (conditional tokens), takerAmount = USDC expected
    const makerAmountRaw = BigInt(Math.floor(Number(shares) * 10 ** USDC_DECIMALS));
    const expectedUsdc = Number(shares) * sellPrice;
    const takerAmountRaw = BigInt(Math.floor(expectedUsdc * 10 ** USDC_DECIMALS));

    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = BigInt("0x" + Array.from(saltBytes).map(b => b.toString(16).padStart(2, "0")).join(""));

    const orderMessage = {
      salt,
      maker: account.address as `0x${string}`,
      signer: account.address as `0x${string}`,
      taker: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      tokenId: BigInt(buyOrder.token_id),
      makerAmount: makerAmountRaw,
      takerAmount: takerAmountRaw,
      expiration: 0n,
      nonce: 0n,
      feeRateBps: 0n,
      side: 1, // SELL
      signatureType: 0,
    };

    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: ORDER_TYPES,
      primaryType: "Order",
      message: orderMessage,
    });

    const orderBody = JSON.stringify({
      order: {
        salt: salt.toString(),
        maker: account.address,
        signer: account.address,
        taker: "0x0000000000000000000000000000000000000000",
        tokenID: buyOrder.token_id,
        makerAmount: makerAmountRaw.toString(),
        takerAmount: takerAmountRaw.toString(),
        expiration: "0",
        nonce: "0",
        feeRateBps: "0",
        side: "SELL",
        signatureType: 0,
        signature,
      },
      owner: account.address,
      orderType: "GTC",
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = "/order";
    const hmac = await generateClobHmac(session.pm_api_secret, timestamp, "POST", path, orderBody);

    const res = await fetch(`${getClobUrl()}${path}`, {
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
      console.error(`[prediction-sell] CLOB SELL failed (${res.status}): ${errText}`);

      const isGeo = errText.toLowerCase().includes("restricted") || errText.toLowerCase().includes("geo") || errText.toLowerCase().includes("region");
      if (isGeo) {
        return json({ error: "Trading restricted in your region", error_code: "clob_geo_blocked" }, 403);
      }

      return json({ error: "Sell order failed", error_code: "clob_error", detail: errText }, 500);
    }

    const clobData = await res.json();
    const orderId = clobData.orderID || clobData.id || null;

    // Record the sell order
    const { data: sellOrder } = await supabase
      .from("prediction_trade_orders")
      .insert({
        wallet: normalizedWallet,
        fight_id,
        prediction_event_id: buyOrder.prediction_event_id,
        polymarket_market_id: buyOrder.polymarket_market_id,
        token_id: buyOrder.token_id,
        side: "SELL",
        order_type: "marketable_limit",
        requested_amount_usdc: expectedUsdc,
        expected_price: sellPrice,
        expected_shares: shares,
        fee_bps: 0,
        fee_usdc: 0,
        slippage_bps: 300,
        polymarket_order_id: orderId,
        status: orderId ? "submitted" : "accepted",
        submitted_at: new Date().toISOString(),
        source_operator_id: buyOrder.source_operator_id,
      })
      .select("id")
      .single();

    console.log(`[prediction-sell] SELL order submitted: ${orderId}, wallet=${normalizedWallet}, fight=${fight_id}, shares=${shares}, price=${sellPrice}`);

    return json({
      success: true,
      sell_order_id: sellOrder?.id,
      polymarket_order_id: orderId,
      sell_price: sellPrice,
      expected_usdc: expectedUsdc,
      shares_sold: shares,
    });
  } catch (err) {
    console.error("[prediction-sell] Error:", err);
    return json({ error: "Internal server error", error_code: "internal_error" }, 500);
  }
});
