/**
 * clobOrderClient — Client-side EIP-712 order signing and submission to Polymarket CLOB.
 *
 * This module runs in the user's browser, bypassing server-side geo-blocking by
 * submitting orders directly from the user's residential IP.
 *
 * Security: Trading key + API credentials are received from the backend per-request
 * and used only in-memory for a single order. Nothing is persisted.
 */

import { privateKeyToAccount } from "viem/accounts";

// ── Polymarket CTF Exchange (Polygon mainnet) ──
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const POLYGON_CHAIN_ID = 137;
const USDC_DECIMALS = 6;
const CLOB_BASE = "https://clob.polymarket.com";
const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";

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

export interface ClobOrderParams {
  token_id: string;
  price: number;
  net_amount_usdc: number;
  fee_rate_bps: number;
}

export interface ClobCredentials {
  api_key: string;
  api_secret: string;
  passphrase: string;
  trading_key: string;
}

export interface ClobSubmitResult {
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
  errorCode?: string;
}

/** Decode a base64 (or URL-safe base64) string to Uint8Array */
function base64ToUint8Array(b64: string): Uint8Array {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

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
    base64ToUint8Array(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Sign an EIP-712 order and POST it to the Polymarket CLOB directly from the browser.
 */
export async function submitClobOrder(
  params: ClobOrderParams,
  credentials: ClobCredentials,
): Promise<ClobSubmitResult> {
  try {
    const account = privateKeyToAccount(credentials.trading_key as `0x${string}`);

    // Calculate raw amounts (6 decimal precision)
    const makerAmountRaw = BigInt(Math.floor(params.net_amount_usdc * 10 ** USDC_DECIMALS));
    const shares = params.net_amount_usdc / params.price;
    const takerAmountRaw = BigInt(Math.floor(shares * 10 ** USDC_DECIMALS));

    // Generate cryptographic salt
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
      tokenId: BigInt(params.token_id),
      makerAmount: makerAmountRaw,
      takerAmount: takerAmountRaw,
      expiration: 0n,
      nonce: 0n,
      feeRateBps: BigInt(params.fee_rate_bps),
      side: 0, // BUY
      signatureType: 0, // EOA
    };

    // EIP-712 sign the order
    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: ORDER_TYPES,
      primaryType: "Order",
      message: orderMessage,
    });

    // Build POST /order body
    const orderBody = JSON.stringify({
      order: {
        salt: salt.toString(),
        maker: account.address,
        signer: account.address,
        taker: "0x0000000000000000000000000000000000000000",
        tokenID: params.token_id,
        makerAmount: makerAmountRaw.toString(),
        takerAmount: takerAmountRaw.toString(),
        expiration: "0",
        nonce: "0",
        feeRateBps: params.fee_rate_bps.toString(),
        side: "BUY",
        signatureType: 0,
        signature,
      },
      owner: account.address,
      orderType: "GTC",
      affiliateAddress: TREASURY_WALLET,
    });

    // L2 HMAC authentication headers
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = "/order";
    const hmac = await generateClobHmac(credentials.api_secret, timestamp, "POST", path, orderBody);

    console.log("[clobOrderClient] Submitting order directly to Polymarket CLOB");

    const res = await fetch(`${CLOB_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        POLY_API_KEY: credentials.api_key,
        POLY_SIGNATURE: hmac,
        POLY_PASSPHRASE: credentials.passphrase,
        POLY_TIMESTAMP: timestamp,
      },
      body: orderBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[clobOrderClient] CLOB order failed (${res.status}):`, errText);

      const isGeoBlock =
        res.status === 403 &&
        (errText.toLowerCase().includes("restricted") || errText.toLowerCase().includes("region"));

      return {
        success: false,
        error: errText,
        errorCode: isGeoBlock ? "clob_geo_blocked" : "clob_rejected",
        status: "failed",
      };
    }

    const data = await res.json();
    const orderId = data.orderID || data.id || null;

    console.log("[clobOrderClient] Order submitted:", orderId);

    return {
      success: !!orderId,
      orderId: orderId || undefined,
      status: orderId ? "submitted" : "accepted",
    };
  } catch (err) {
    console.error("[clobOrderClient] Order signing/submission error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: "client_signing_error",
      status: "failed",
    };
  }
}
