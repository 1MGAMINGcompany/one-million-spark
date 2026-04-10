import { createClient } from "@supabase/supabase-js";
// Auth is now done via Privy REST API (no JWKS dependency)
import { privateKeyToAccount } from "npm:viem@2/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi } from "npm:viem@2";
import { polygon } from "npm:viem@2/chains";

/**
 * prediction-submit — Production trade execution gateway.
 *
 * Polymarket-backed events: EIP-712 signed orders via user's CLOB credentials
 * Native 1MGAMING events: Local pool accounting only
 *
 * Lifecycle: requested → submitted → filled/partial_fill/failed
 * Explicit fee model: fee collected via Privy server-side USDC transfer to treasury.
 * Builder wallet is NEVER used as the user's trading identity.
 *
 * April 2026 fixes:
 * - Nonce mutex: sequential relayer txs use incremented nonce within same request
 * - CLOB proxy: route order submission through CLOB_PROXY_URL to avoid geo-block
 * - Shared credential fallback: REMOVED — per-user sessions only
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const MIN_PREDICTION_USD = 1.0;

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
// Bridged USDC.e — the trading token for Polymarket
const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
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
 * Resolve the effective CLOB base URL.
 * If CLOB_PROXY_URL is set, route through the proxy to avoid geo-blocking.
 * Otherwise use the direct Polymarket endpoint.
 */
function getClobUrl(): string {
  return Deno.env.get("CLOB_PROXY_URL") || CLOB_BASE;
}

/**
 * Build an EIP-712 signed Polymarket CLOB order and submit it.
 * Uses the user's derived trading key for order signing and L2 HMAC for API auth.
 * Routes through CLOB_PROXY_URL if configured to avoid geo-blocking.
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
  dynamicFeeRateBps: number = 0,
): Promise<{ orderId: string | null; status: string; error?: string; httpStatus?: number }> {
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
      feeRateBps: BigInt(dynamicFeeRateBps),
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
        feeRateBps: dynamicFeeRateBps.toString(),
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
    const hmac = await generateClobHmac(session.pm_api_secret, timestamp, "POST", path, orderBody);

    const clobUrl = getClobUrl();
    console.log(`[prediction-submit] Submitting CLOB order via ${clobUrl}`);

    const res = await fetch(`${clobUrl}${path}`, {
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
      return { orderId: null, status: "clob_error", error: errText, httpStatus: res.status };
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

function isSessionTradeReady(session: {
  status?: string | null;
  safe_deployed?: boolean | null;
  approvals_set?: boolean | null;
  pm_api_key?: string | null;
  pm_api_secret?: string | null;
  pm_passphrase?: string | null;
  pm_trading_key?: string | null;
  expires_at?: string | null;
} | null | undefined) {
  if (!session) return false;
  const isExpired = session.expires_at
    ? new Date(session.expires_at).getTime() < Date.now()
    : false;

  return session.status === "active" &&
    !!session.safe_deployed &&
    !!session.approvals_set &&
    !!session.pm_api_key &&
    !!session.pm_api_secret &&
    !!session.pm_passphrase &&
    !!session.pm_trading_key &&
    !isExpired;
}

function isGeoBlockedMessage(message?: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("restricted in your region") ||
    normalized.includes("geo") ||
    normalized.includes("region") ||
    normalized.includes("restricted");
}

/**
 * Execute fee collection via relayer wallet using ERC-20 transferFrom.
 * The user must have previously approved the relayer as spender on USDC.
 * Returns the tx hash of the transferFrom call.
 */
const erc20TransferFromAbi = parseAbi([
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
  "https://polygon.llamarpc.com",
];

/** Try a JSON-RPC call across multiple endpoints, return first valid result */
async function polygonRpcCall(
  body: Record<string, unknown>,
): Promise<{ result?: string; error?: string; rpc?: string }> {
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { await res.text().catch(() => {}); continue; }
      const json = await res.json();
      if (json.error) continue;
      if (json.result != null && json.result !== "0x") {
        return { result: json.result, rpc };
      }
      // "0x" is valid for zero balances/allowances
      if (json.result === "0x") return { result: "0x0", rpc };
    } catch {
      continue;
    }
  }
  return { error: "all_rpcs_failed" };
}

// ── Nonce Manager ──────────────────────────────────────────
// Tracks the relayer's nonce within a single request to prevent
// the second tx (fundDerivedWallet) from colliding with the first (fee collection).
// Uses "pending" mempool nonce as baseline, then increments locally.

class RelayerNonceManager {
  private currentNonce: number | null = null;
  private relayerAddress: string;

  constructor(relayerAddress: string) {
    this.relayerAddress = relayerAddress;
  }

  async getNextNonce(): Promise<{ nonce: number; error?: string }> {
    if (this.currentNonce !== null) {
      // Already used one nonce in this request — increment
      this.currentNonce++;
      console.log(`[nonce-manager] Using incremented nonce: ${this.currentNonce}`);
      return { nonce: this.currentNonce };
    }

    // First call: fetch from chain using "pending" to include mempool txs
    const nonceRpc = await polygonRpcCall({
      jsonrpc: "2.0", id: 2,
      method: "eth_getTransactionCount",
      params: [this.relayerAddress, "pending"],
    });

    if (nonceRpc.error || nonceRpc.result == null) {
      console.error("[nonce-manager] Nonce RPC failed:", nonceRpc.error);
      return { nonce: -1, error: "rpc_nonce_unavailable" };
    }

    this.currentNonce = Number(BigInt(nonceRpc.result));
    console.log(`[nonce-manager] Initial pending nonce: ${this.currentNonce}`);
    return { nonce: this.currentNonce };
  }
}

/**
 * Send a relayer transaction with retry logic for nonce errors.
 * Retries up to 2 times on "nonce too low" or "replacement" errors.
 */
async function sendRelayerTxWithRetry(
  walletClient: ReturnType<typeof createWalletClient>,
  txParams: {
    to: `0x${string}`;
    data: `0x${string}`;
    gas: bigint;
    gasPrice: bigint;
    nonce: number;
    value: bigint;
  },
  nonceManager: RelayerNonceManager,
  label: string,
): Promise<{ txHash: string; nonce: number }> {
  let lastError: Error | null = null;
  let currentNonce = txParams.nonce;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[relayer-tx] ${label} attempt=${attempt} nonce=${currentNonce}`);
      const txHash = await walletClient.sendTransaction({
        ...txParams,
        nonce: currentNonce,
      });
      console.log(`[relayer-tx] ${label} SUCCESS tx=${txHash} nonce=${currentNonce}`);
      return { txHash, nonce: currentNonce };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message.toLowerCase();
      const isNonceError = msg.includes("nonce") || msg.includes("replacement") || msg.includes("already known");

      if (isNonceError && attempt < 2) {
        console.warn(`[relayer-tx] ${label} nonce error (attempt ${attempt}), retrying with nonce+1: ${lastError.message.substring(0, 150)}`);
        // Re-fetch fresh nonce from pending pool
        const fresh = await nonceManager.getNextNonce();
        if (fresh.error) throw lastError;
        currentNonce = fresh.nonce;
        continue;
      }

      throw lastError;
    }
  }

  throw lastError!;
}

async function collectFeeViaRelayer(
  userWallet: string,
  feeUsdc: number,
  walletEoa: string | undefined,
  nonceManager: RelayerNonceManager,
): Promise<{ success: boolean; txHash?: string; error?: string; error_code?: string; from_address?: string }> {
  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (!relayerKey) {
    return { success: false, error: "relayer_not_configured", error_code: "relayer_not_configured" };
  }

  try {
    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    const feeRaw = BigInt(Math.floor(feeUsdc * 10 ** USDC_DECIMALS));

    // Build list of candidate addresses to check allowance (Smart Wallet + EOA)
    const candidates: string[] = [userWallet];
    if (walletEoa && walletEoa.toLowerCase() !== userWallet.toLowerCase()) {
      candidates.push(walletEoa);
    }

    let fromAddress: string | null = null;

    for (const candidate of candidates) {
      const allowanceCallData = encodeFunctionData({
        abi: erc20TransferFromAbi,
        functionName: "allowance",
        args: [candidate as `0x${string}`, account.address],
      });

      const allowanceRpc = await polygonRpcCall({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{ to: USDC_CONTRACT, data: allowanceCallData }, "latest"],
      });

      if (allowanceRpc.error || !allowanceRpc.result) continue;

      const currentAllowance = BigInt(allowanceRpc.result);
      if (currentAllowance >= feeRaw) {
        fromAddress = candidate;
        console.log(`[prediction-submit] Allowance found on ${candidate}: ${currentAllowance} >= ${feeRaw}`);
        break;
      } else {
        console.log(`[prediction-submit] Allowance insufficient on ${candidate}: ${currentAllowance} < ${feeRaw}`);
      }
    }

    if (!fromAddress) {
      return {
        success: false,
        error: `insufficient_allowance on all addresses: ${candidates.join(", ")}`,
        error_code: "insufficient_allowance",
      };
    }

    // Execute transferFrom from the address that has allowance
    const txData = encodeFunctionData({
      abi: erc20TransferFromAbi,
      functionName: "transferFrom",
      args: [
        fromAddress as `0x${string}`,
        TREASURY_WALLET as `0x${string}`,
        feeRaw,
      ],
    });

    const { nonce, error: nonceError } = await nonceManager.getNextNonce();
    if (nonceError) {
      return { success: false, error: nonceError, error_code: "rpc_nonce_unavailable" };
    }

    const gasPriceRpc = await polygonRpcCall({
      jsonrpc: "2.0", id: 3,
      method: "eth_gasPrice",
      params: [],
    });

    if (gasPriceRpc.error || gasPriceRpc.result == null) {
      console.error("[prediction-submit] Gas price RPC failed:", gasPriceRpc.error);
      return { success: false, error: "rpc_gas_price_unavailable", error_code: "rpc_gas_price_unavailable" };
    }

    const gasPrice = BigInt(gasPriceRpc.result);
    const workingRpc = gasPriceRpc.rpc || POLYGON_RPCS[0];

    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(workingRpc),
    });

    const result = await sendRelayerTxWithRetry(
      walletClient,
      {
        to: USDC_CONTRACT as `0x${string}`,
        data: txData as `0x${string}`,
        gas: 100_000n,
        gasPrice: gasPrice * 12n / 10n,
        nonce,
        value: 0n,
      },
      nonceManager,
      "fee_collection",
    );

    console.log(`[prediction-submit] Fee collected via relayer: ${result.txHash}, fee=$${feeUsdc}, from=${fromAddress}, nonce=${result.nonce}, rpc=${workingRpc}`);
    return { success: true, txHash: result.txHash, from_address: fromAddress };
  } catch (err) {
    console.error("[prediction-submit] Relayer transferFrom failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      error_code: "relayer_tx_failed",
    };
  }
}

/**
 * Transfer USDC.e from user's Privy wallet to their derived trading EOA/Safe.
 * Uses the relayer to execute transferFrom (requires prior USDC.e approval from user).
 * Uses the shared NonceManager to prevent nonce collision with fee collection.
 */
async function fundDerivedWallet(
  userWallet: string,
  derivedAddress: string,
  amountUsdc: number,
  walletEoa: string | undefined,
  nonceManager: RelayerNonceManager,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (!relayerKey) {
    return { success: false, error: "relayer_not_configured" };
  }

  try {
    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    const amountRaw = BigInt(Math.floor(amountUsdc * 10 ** USDC_DECIMALS));

    // Check allowance on both Smart Wallet and EOA
    const candidates: string[] = [userWallet];
    if (walletEoa && walletEoa.toLowerCase() !== userWallet.toLowerCase()) {
      candidates.push(walletEoa);
    }

    let fromAddress: string | null = null;

    for (const candidate of candidates) {
      const allowanceCallData = encodeFunctionData({
        abi: erc20TransferFromAbi,
        functionName: "allowance",
        args: [candidate as `0x${string}`, account.address],
      });

      const allowanceRpc = await polygonRpcCall({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{ to: USDC_CONTRACT, data: allowanceCallData }, "latest"],
      });

      if (allowanceRpc.error || !allowanceRpc.result) continue;

      const currentAllowance = BigInt(allowanceRpc.result);
      if (currentAllowance >= amountRaw) {
        fromAddress = candidate;
        console.log(`[prediction-submit] Fund allowance found on ${candidate}: ${currentAllowance} >= ${amountRaw}`);
        break;
      }
    }

    if (!fromAddress) {
      return { success: false, error: `insufficient_allowance_for_funding on all addresses: ${candidates.join(", ")}` };
    }

    // Execute transferFrom: from address with allowance → derived trading wallet
    const txData = encodeFunctionData({
      abi: erc20TransferFromAbi,
      functionName: "transferFrom",
      args: [
        fromAddress as `0x${string}`,
        derivedAddress as `0x${string}`,
        amountRaw,
      ],
    });

    const { nonce, error: nonceError } = await nonceManager.getNextNonce();
    if (nonceError) {
      return { success: false, error: nonceError };
    }

    const gasPriceRpc = await polygonRpcCall({
      jsonrpc: "2.0", id: 3,
      method: "eth_gasPrice",
      params: [],
    });

    if (gasPriceRpc.error || gasPriceRpc.result == null) {
      return { success: false, error: "rpc_gas_price_unavailable" };
    }

    const workingRpc = gasPriceRpc.rpc || POLYGON_RPCS[0];
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(workingRpc),
    });

    const result = await sendRelayerTxWithRetry(
      walletClient,
      {
        to: USDC_CONTRACT as `0x${string}`,
        data: txData as `0x${string}`,
        gas: 100_000n,
        gasPrice: BigInt(gasPriceRpc.result) * 12n / 10n,
        nonce,
        value: 0n,
      },
      nonceManager,
      "fund_derived_wallet",
    );

    console.log(`[prediction-submit] Funded derived wallet: ${result.txHash}, amount=$${amountUsdc}, from=${fromAddress}, to=${derivedAddress}, nonce=${result.nonce}`);
    return { success: true, txHash: result.txHash };
  } catch (err) {
    console.error("[prediction-submit] Fund derived wallet failed:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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
  // Cryptographic JWKS verification: validates signature against Privy public keys
  let privyDid: string | null = null;
  {
    const privyToken = req.headers.get("x-privy-token");
    const appId = Deno.env.get("VITE_PRIVY_APP_ID");

    if (!privyToken || privyToken.length < 20 || !appId) {
      await auditLog(supabase, null, null, "auth_required_failed", null, {
        reason: !privyToken ? "missing_privy_token" : !appId ? "missing_app_id" : "token_too_short",
      });
      return json({ error: "Authentication required", error_code: "auth_required" }, 401);
    }

    try {
      const parts = privyToken.split(".");
      if (parts.length !== 3) throw new Error("malformed_jwt");

      // Decode header to get key ID (kid)
      const headerB64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
      const header = JSON.parse(atob(headerB64));

      // Decode payload for claims verification
      const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payloadJson = atob(payloadB64);
      const jwtPayload = JSON.parse(payloadJson);

      // Verify claims first (fast fail)
      const now = Math.floor(Date.now() / 1000);
      if (jwtPayload.exp && jwtPayload.exp < now) throw new Error("token_expired");
      if (jwtPayload.iss !== "privy.io") throw new Error("invalid_issuer");
      if (jwtPayload.aud !== appId) throw new Error("invalid_audience");

      // Fetch Privy JWKS and verify signature cryptographically
      const jwksUrl = `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`;
      const jwksRes = await fetch(jwksUrl);
      if (!jwksRes.ok) throw new Error("jwks_fetch_failed");
      const { keys } = await jwksRes.json();

      const matchingKey = keys.find((k: any) => k.kid === header.kid);
      if (!matchingKey) throw new Error("unknown_signing_key");

      // Determine algorithm from JWK
      const alg = matchingKey.kty === "EC"
        ? { name: "ECDSA", namedCurve: matchingKey.crv || "P-256" }
        : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      const verifyAlg = matchingKey.kty === "EC"
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5" };

      const cryptoKey = await crypto.subtle.importKey(
        "jwk", matchingKey, alg, false, ["verify"],
      );

      const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const sigB64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
      const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));

      const valid = await crypto.subtle.verify(verifyAlg, cryptoKey, sig, data);
      if (!valid) throw new Error("invalid_jwt_signature");

      privyDid = (jwtPayload.sub as string) || null;
      if (!privyDid) throw new Error("no_did_in_token");

      console.log("[prediction-submit] JWT cryptographically verified, DID:", privyDid.slice(0, 20));
    } catch (e) {
      await auditLog(supabase, null, null, "auth_required_failed", null, {
        reason: "jwt_verification_failed",
        error: (e as Error).message,
      });
      return json({ error: "Authentication failed", error_code: "auth_failed" }, 401);
    }
  }

  try {
    const body = await req.json();
    const {
      fight_id,
      wallet,
      wallet_eoa,
      fighter_pick,
      amount_usd,
      slippage_bps: clientSlippage,
      source_operator_id,
      quote_price: clientQuotePrice,
      accepted_requote: acceptedRequote = false,
      requote_count: rawRequoteCount,
    } = body;

    const requoteCount = Number.isFinite(Number(rawRequoteCount))
      ? Math.max(0, Math.trunc(Number(rawRequoteCount)))
      : 0;
    const normalizedQuotePrice = clientQuotePrice != null
      ? Number(clientQuotePrice)
      : null;
    const acceptedQuotePrice = normalizedQuotePrice != null && Number.isFinite(normalizedQuotePrice) && normalizedQuotePrice > 0
      ? normalizedQuotePrice
      : null;

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
      fight_id,
      fighter_pick,
      amount_usd: parsedAmount,
      accepted_requote: Boolean(acceptedRequote),
      requote_count: requoteCount,
      quote_price: acceptedQuotePrice,
    });

    // ═══════════════════════════════════════════════════
    // 2) RESOLVE USER ACCOUNT (with Privy DID binding)
    // ═══════════════════════════════════════════════════
    let accountId: string | null = null;
    {
      let existing: { id: string; wallet_evm: string | null; privy_did: string | null } | null = null;
      if (privyDid) {
        const { data } = await supabase
          .from("prediction_accounts")
          .select("id, wallet_evm, privy_did")
          .eq("privy_did", privyDid)
          .maybeSingle();
        existing = data;
      }
      if (!existing) {
        const { data } = await supabase
          .from("prediction_accounts")
          .select("id, wallet_evm, privy_did")
          .eq("wallet_evm", normalizedWallet)
          .maybeSingle();
        existing = data;
      }

      const canonicalWallet = existing?.wallet_evm
        ? String(existing.wallet_evm).trim().toLowerCase()
        : normalizedWallet;

      if (existing) {
        accountId = existing.id;
        const updatePayload: Record<string, unknown> = {
          last_active_at: new Date().toISOString(),
          auth_provider: "privy",
        };
        if (!existing.wallet_evm && canonicalWallet) updatePayload.wallet_evm = canonicalWallet;
        if (privyDid) updatePayload.privy_did = privyDid;
        await supabase
          .from("prediction_accounts")
          .update(updatePayload)
          .eq("id", accountId);
      } else {
        const insertPayload: Record<string, unknown> = {
          wallet_evm: canonicalWallet,
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

      normalizedWallet = canonicalWallet;
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
    const isPolymarketEvent = !!(fight.polymarket_market_id && fight.polymarket_outcome_a_token);
    const polymarketInPlay = isPolymarketEvent && (fight.status === "live" || fight.status === "locked");

    if (!TRADABLE_STATUSES.has(fight.status) && !polymarketInPlay) {
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
    // EVENT DATE GUARD
    // ═══════════════════════════════════════════════════
    const hasPolymarketRouting = !!(fight.polymarket_market_id && fight.polymarket_outcome_a_token);

    if (fight.event_id && !hasPolymarketRouting) {
      const { data: eventData } = await supabase
        .from("prediction_events")
        .select("event_date, status")
        .eq("id", fight.event_id)
        .single();

      if (eventData?.event_date) {
        const eventStart = new Date(eventData.event_date).getTime();
        if (eventStart <= Date.now()) {
          await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id, event_date: eventData.event_date }, { error_code: "event_already_started" });
          return json({ error: "This event has already started — predictions are closed", error_code: "event_already_started" }, 400);
        }
      }

      const { count: lockedSiblings } = await supabase
        .from("prediction_fights")
        .select("id", { count: "exact", head: true })
        .eq("event_id", fight.event_id)
        .in("status", ["locked", "live"]);

      if ((lockedSiblings ?? 0) > 0) {
        await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id, locked_siblings: lockedSiblings }, { error_code: "event_already_started" });
        return json({ error: "This event has already started — predictions are closed", error_code: "event_already_started" }, 400);
      }
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
        console.warn(`[prediction-submit] polymarket_active=false for fight ${fight_id}, allowing in-play trading`);
      }

      if (fight.polymarket_end_date) {
        const pmEnd = new Date(fight.polymarket_end_date);
        const evDate = fight.event_date ? new Date(fight.event_date) : null;
        const isSameAsStart = evDate && Math.abs(pmEnd.getTime() - evDate.getTime()) < 60_000;
        const effectiveClose = isSameAsStart
          ? new Date(pmEnd.getTime() + 6 * 3600_000)
          : pmEnd;
        if (effectiveClose <= new Date()) {
          await auditLog(supabase, null, normalizedWallet, "tradability_check_failed", { fight_id }, { error_code: "market_expired", end_date: fight.polymarket_end_date, effective_close: effectiveClose.toISOString() });
          return json({ error: "This market has closed", error_code: "market_expired" }, 400);
        }
      }

      const lastSynced = fight.polymarket_last_synced_at
        ? new Date(fight.polymarket_last_synced_at).getTime()
        : 0;
      const priceAge = Date.now() - lastSynced;
      const effectiveStaleness = polymarketInPlay
        ? 30 * 60 * 1000
        : MAX_PRICE_STALENESS_MS;
      if (lastSynced === 0 || priceAge > effectiveStaleness) {
        await auditLog(supabase, null, normalizedWallet, "stale_quote_rejected", { fight_id }, {
          error_code: "stale_quote",
          price_age_ms: priceAge,
          threshold_ms: effectiveStaleness,
          last_synced: fight.polymarket_last_synced_at || "never",
        });
        return json({ error: "Market price data is stale. Please try again shortly.", error_code: "stale_quote" }, 400);
      }
    }

    // ═══════════════════════════════════════════════════
    // 5b) PM SESSION CHECK — per-user ONLY, no shared fallback
    // ═══════════════════════════════════════════════════
    if (isPolymarketBacked) {
      const { data: pmSession } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, safe_deployed, approvals_set, pm_api_key, pm_api_secret, pm_passphrase, pm_trading_key, expires_at")
        .eq("wallet", normalizedWallet)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const hasPerUserSession = pmSession && isSessionTradeReady(pmSession);

      if (!hasPerUserSession) {
        await auditLog(supabase, null, normalizedWallet, "pm_session_check_failed", { fight_id }, {
          reason: pmSession ? "per_user_session_not_ready" : "no_per_user_session",
          session_status: pmSession?.status,
        });
        return json({
          error: "Trading wallet not set up. Please complete setup first.",
          error_code: "trading_wallet_setup_required",
        }, 403);
      }
    }

    // ═══════════════════════════════════════════════════
    // 6) EXPLICIT FEE MODEL
    // ═══════════════════════════════════════════════════
    const isPolymarketSource = fight.source === "polymarket";
    const effectiveFeeBps =
      fight.commission_bps != null
        ? Number(fight.commission_bps)
        : isPolymarketSource
          ? 225
          : 500;
    const fee_usd = Number(
      ((parsedAmount * effectiveFeeBps) / 10_000).toFixed(6),
    );
    const net_amount_usdc = Number((parsedAmount - fee_usd).toFixed(6));
    const shares = Math.floor(net_amount_usdc * 100);

    const systemMaxSlippage = controls
      ? Number(controls.max_slippage_bps)
      : 300;
    const effectiveSlippage =
      clientSlippage != null
        ? Math.min(Number(clientSlippage), systemMaxSlippage)
        : systemMaxSlippage;

    const cachedExpectedPrice = isPolymarketBacked
      ? Number(
          fighter_pick === "fighter_a"
            ? fight.price_a || 0.5
            : fight.price_b || 0.5,
        )
      : null;
    const usingAcceptedRequoteBaseline = Boolean(
      acceptedRequote &&
      requoteCount === 1 &&
      acceptedQuotePrice != null,
    );
    const expectedPrice = usingAcceptedRequoteBaseline
      ? acceptedQuotePrice
      : cachedExpectedPrice;

    if (acceptedRequote && requoteCount > 1) {
      return json({
        error: "Market is moving too fast right now. Please review a fresh quote and try again.",
        error_code: "market_moving_too_fast",
      }, 409);
    }

    // ═══════════════════════════════════════════════════
    // SLIPPAGE CHECK — fetch live price and compare
    // ═══════════════════════════════════════════════════
    if (isPolymarketBacked && tokenId && expectedPrice) {
      const clobUrl = getClobUrl();
      let livePriceAtValidation: number | null = null;
      try {
        const priceRes = await fetch(`${clobUrl}/price?token_id=${tokenId}&side=buy`);
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const livePrice = Number(priceData.price ?? 0);
          if (livePrice > 0) {
            livePriceAtValidation = livePrice;
            const slippageBps = Math.abs(livePrice - expectedPrice) / expectedPrice * 10_000;
            console.log(
              `[prediction-submit] price check fight=${fight_id} baseline=${expectedPrice} live=${livePrice} tolerance_bps=${effectiveSlippage} accepted_requote=${Boolean(acceptedRequote)} requote_count=${requoteCount}`,
            );

            await auditLog(supabase, null, normalizedWallet, "live_price_checked", { fight_id }, {
              baseline_price: expectedPrice,
              cached_price: cachedExpectedPrice,
              live_price: livePrice,
              slippage_bps: Math.round(slippageBps),
              tolerance_bps: effectiveSlippage,
              accepted_requote: Boolean(acceptedRequote),
              requote_count: requoteCount,
              quote_source: usingAcceptedRequoteBaseline ? "accepted_requote" : "cached_fight_price",
            });

            if (slippageBps > effectiveSlippage) {
              // Calculate updated payout estimate at the new price
              const updatedShares = net_amount_usdc / livePrice;
              const updatedPayout = updatedShares; // 1 share = $1 at settlement

              const priceChangePayload = {
                old_price: expectedPrice,
                new_price: livePrice,
                updated_payout: Number(updatedPayout.toFixed(4)),
                slippage_bps: Math.round(slippageBps),
                tolerance_bps: effectiveSlippage,
                requote_count: requoteCount,
              };

              if (acceptedRequote || requoteCount >= 1) {
                await auditLog(supabase, null, normalizedWallet, "market_moving_too_fast", { fight_id }, priceChangePayload);
                return json({
                  error: "Market is moving too fast right now. Please review a fresh quote and try again.",
                  error_code: "market_moving_too_fast",
                  ...priceChangePayload,
                }, 409);
              }

              await auditLog(supabase, null, normalizedWallet, "requote_required", { fight_id }, {
                expected: expectedPrice,
                live: livePrice,
                slippage_bps: slippageBps,
                max_bps: effectiveSlippage,
                updated_payout: updatedPayout,
                quote_source: usingAcceptedRequoteBaseline ? "accepted_requote" : "cached_fight_price",
                requote_count: requoteCount,
              });
              return json({
                error: "Odds have changed since you opened this ticket.",
                error_code: "price_changed_requote_required",
                ...priceChangePayload,
                max_requote_cycles: 1,
              }, 409);
            }
          }
        }

        await auditLog(supabase, null, normalizedWallet, "controls_passed", {
          fight_id,
          fee_bps: effectiveFeeBps,
          slippage_bps: effectiveSlippage,
          is_polymarket: isPolymarketBacked,
        }, {
          price_used_for_order: expectedPrice,
          live_price: livePriceAtValidation,
          accepted_requote: Boolean(acceptedRequote),
          requote_count: requoteCount,
        });
      } catch (slipErr) {
        // Non-fatal: if live price check fails, proceed with cached price
        // Apply fallback restrictions for large orders
        const cachedAge = fight.polymarket_last_synced_at
          ? Date.now() - new Date(fight.polymarket_last_synced_at).getTime()
          : Infinity;

        const fallbackAllowed = cachedAge < FALLBACK_MAX_PRICE_AGE_MS &&
          !!fight.polymarket_market_id &&
          !!tokenId &&
          parsedAmount <= FALLBACK_MAX_ORDER_USDC;

        if (!fallbackAllowed) {
          await auditLog(supabase, null, normalizedWallet, "cached_price_fallback_rejected", { fight_id }, {
            cached_age_ms: cachedAge,
            max_age_ms: FALLBACK_MAX_PRICE_AGE_MS,
            amount: parsedAmount,
            max_fallback_usdc: FALLBACK_MAX_ORDER_USDC,
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

    if (!(isPolymarketBacked && tokenId && expectedPrice)) {
      await auditLog(supabase, null, normalizedWallet, "controls_passed", {
        fight_id,
        fee_bps: effectiveFeeBps,
        slippage_bps: effectiveSlippage,
        is_polymarket: isPolymarketBacked,
      }, {
        price_used_for_order: expectedPrice,
        accepted_requote: Boolean(acceptedRequote),
        requote_count: requoteCount,
      });
    }

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
    // Initialize shared nonce manager for relayer txs in this request
    // ═══════════════════════════════════════════════════
    const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
    let nonceManager: RelayerNonceManager | null = null;
    if (relayerKey) {
      const relayerAccount = privateKeyToAccount(relayerKey as `0x${string}`);
      nonceManager = new RelayerNonceManager(relayerAccount.address);
    }

    // ═══════════════════════════════════════════════════
    // 7) FEE COLLECTION — backend relayer executes transferFrom
    // ═══════════════════════════════════════════════════
    let feeCollected = false;
    let feeTxHash: string | null = null;

    if (fee_usd > 0.01) {
      if (!nonceManager) {
        await updateTradeOrder(supabase, tradeOrderId, {
          status: "failed",
          error_code: "relayer_not_configured",
          error_message: "Fee relayer not configured",
          finalized_at: new Date().toISOString(),
        });
        return json({ error: "Trading infrastructure not available", error_code: "relayer_not_configured", trade_order_id: tradeOrderId }, 502);
      }

      await auditLog(supabase, tradeOrderId, normalizedWallet, "fee_collection_started", {
        fee_usdc: fee_usd,
        treasury: TREASURY_WALLET,
      });

      const normalizedEoa = wallet_eoa ? String(wallet_eoa).trim().toLowerCase() : undefined;
      const collectResult = await collectFeeViaRelayer(normalizedWallet!, fee_usd, normalizedEoa, nonceManager);

      if (collectResult.success && collectResult.txHash) {
        feeCollected = true;
        feeTxHash = collectResult.txHash;

        await updateTradeOrder(supabase, tradeOrderId, { fee_tx_hash: feeTxHash });

        await auditLog(supabase, tradeOrderId, normalizedWallet, "fee_collected_via_relayer", null, {
          tx_hash: feeTxHash,
          fee_usdc: fee_usd,
        });
      } else {
        await auditLog(supabase, tradeOrderId, normalizedWallet, "fee_collection_failed", null, {
          error: collectResult.error,
          error_code: collectResult.error_code,
          fee_usdc: fee_usd,
        });

        const isAllowanceError = collectResult.error_code === "insufficient_allowance" || collectResult.error?.includes("insufficient_allowance");
        const isRpcError = collectResult.error_code?.startsWith("rpc_");
        const specificCode = collectResult.error_code || (isAllowanceError ? "insufficient_allowance" : "fee_collection_failed");

        await updateTradeOrder(supabase, tradeOrderId, {
          status: "failed",
          error_code: specificCode,
          error_message: collectResult.error?.substring(0, 500),
          finalized_at: new Date().toISOString(),
        });

        return json(
          {
            error: isAllowanceError
              ? "USDC approval needed. Please approve USDC spending and try again."
              : isRpcError
              ? "Network temporarily unavailable. Please try again in a moment."
              : "Fee collection failed. Please try again.",
            error_code: specificCode,
            trade_order_id: tradeOrderId,
          },
          isAllowanceError ? 403 : 502,
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
    let pmFeeRateBps = 0;

    if (isPolymarketBacked) {
      // ── Per-user credentials ONLY — no shared fallback ──
      const { data: userSession } = await supabase
        .from("polymarket_user_sessions")
        .select("pm_api_key, pm_api_secret, pm_passphrase, pm_trading_key, status, safe_address, safe_deployed, approvals_set, expires_at")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!isSessionTradeReady(userSession)) {
        await updateTradeOrder(supabase, tradeOrderId, {
          status: "failed",
          error_code: "trading_wallet_not_ready",
          error_message: "No usable Polymarket trading session found for this wallet.",
          finalized_at: new Date().toISOString(),
        });
        return json({
          error: "Trading wallet setup incomplete. Please complete wallet setup first.",
          error_code: "trading_wallet_not_ready",
          trade_order_id: tradeOrderId,
        }, 403);
      }

      const pmApiKey = userSession!.pm_api_key;
      const pmApiSecret = userSession!.pm_api_secret;
      const pmPassphrase = userSession!.pm_passphrase;
      const pmTradingKey = userSession!.pm_trading_key;
      const userSafeAddress = userSession!.safe_address;

      if (tokenId) {
        // ── Fund derived trading wallet with USDC.e before order ──
        const derivedAccount = privateKeyToAccount(pmTradingKey as `0x${string}`);
        const derivedAddr = userSafeAddress || derivedAccount.address.toLowerCase();

        await auditLog(supabase, tradeOrderId, normalizedWallet, "funding_derived_wallet", {
          derived_address: derivedAddr,
          amount_usdc: net_amount_usdc,
        });

        const normalizedEoaForFund = wallet_eoa ? String(wallet_eoa).trim().toLowerCase() : undefined;
        const fundResult = await fundDerivedWallet(normalizedWallet!, derivedAddr, net_amount_usdc, normalizedEoaForFund, nonceManager!);

        if (!fundResult.success) {
          await auditLog(supabase, tradeOrderId, normalizedWallet, "funding_derived_wallet_failed", null, {
            error: fundResult.error,
          });

          await updateTradeOrder(supabase, tradeOrderId, {
            status: "failed",
            error_code: "funding_failed",
            error_message: fundResult.error?.substring(0, 500),
            finalized_at: new Date().toISOString(),
          });

          const isAllowanceErr = fundResult.error?.includes("insufficient_allowance");
          return json({
            error: isAllowanceErr
              ? "USDC.e approval needed for trading. Please approve and try again."
              : "Failed to fund trading wallet. Please try again.",
            error_code: isAllowanceErr ? "insufficient_allowance" : "funding_failed",
            trade_order_id: tradeOrderId,
          }, isAllowanceErr ? 403 : 502);
        }

        await auditLog(supabase, tradeOrderId, normalizedWallet, "derived_wallet_funded", null, {
          tx_hash: fundResult.txHash,
          amount_usdc: net_amount_usdc,
          derived_address: derivedAddr,
        });

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
          cred_source: "per_user",
          accepted_requote: Boolean(acceptedRequote),
          requote_count: requoteCount,
        });

        // ── Fetch dynamic Polymarket fee rate ──
        pmFeeRateBps = 0;
        const clobUrl = getClobUrl();
        try {
          const feeRes = await fetch(`${clobUrl}/fee-rate?token_id=${tokenId}`);
          if (feeRes.ok) {
            const feeData = await feeRes.json();
            pmFeeRateBps = Number(feeData.fee_rate_bps ?? feeData.feeRateBps ?? 0);
            console.log(`[prediction-submit] Polymarket fee rate for token ${tokenId}: ${pmFeeRateBps} bps`);
          } else {
            console.warn(`[prediction-submit] Fee rate fetch failed (${feeRes.status}), using 0 bps`);
          }
        } catch (feeErr) {
          console.warn("[prediction-submit] Fee rate fetch error:", feeErr);
        }

        // ── EIP-712 signed CLOB order submission ──
        const orderResult = await buildAndSubmitClobOrder(
          {
            pm_api_key: pmApiKey!,
            pm_api_secret: pmApiSecret!,
            pm_passphrase: pmPassphrase!,
            pm_trading_key: pmTradingKey!,
          },
          tokenId!,
          expectedPrice!,
          net_amount_usdc,
          pmFeeRateBps,
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
          tradeStatus = "submitted";
          filledAmountUsdc = 0;
          filledShares = 0;
          avgFillPrice = null;

          await updateTradeOrder(supabase, tradeOrderId, {
            status: "submitted",
            polymarket_order_id: orderResult.orderId,
            expected_price: expectedPrice,
            expected_shares: shares,
            pm_fee_rate_bps: pmFeeRateBps,
          });

          // ── Post-submit targeted reconciliation (best-effort, 2s timeout) ──
          try {
            await auditLog(supabase, tradeOrderId, normalizedWallet, "post_submit_reconcile_started");

            const reconPath = `/order/${orderResult.orderId}`;
            const reconTs = Math.floor(Date.now() / 1000).toString();
            const reconHmac = await generateClobHmac(
              pmApiSecret!,
              reconTs,
              "GET",
              reconPath,
            );

            const reconController = new AbortController();
            const reconTimeout = setTimeout(
              () => reconController.abort(),
              2000,
            );

            const reconRes = await fetch(`${clobUrl}${reconPath}`, {
              headers: {
                "Content-Type": "application/json",
                POLY_API_KEY: pmApiKey!,
                POLY_SIGNATURE: reconHmac,
                POLY_PASSPHRASE: pmPassphrase!,
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
                if (newStatus === "filled") {
                  reconUpdates.finalized_at = new Date().toISOString();
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
          // CLOB rejection — Polymarket order was NOT placed.
          const isGeoBlock =
            (orderResult.httpStatus === 403 && isGeoBlockedMessage(orderResult.error)) ||
            isGeoBlockedMessage(orderResult.error);

          const errorCode = isGeoBlock ? "clob_geo_blocked" : "clob_rejected";
          const errorMsg = isGeoBlock
            ? "Polymarket is restricted in your region. Order was not placed."
            : "Order was rejected by the exchange. Please try again.";

          await updateTradeOrder(supabase, tradeOrderId, {
            status: "failed",
            error_code: errorCode,
            error_message: orderResult.error?.substring(0, 500) || errorMsg,
            finalized_at: new Date().toISOString(),
          });

          await auditLog(supabase, tradeOrderId, normalizedWallet, "clob_order_failed_no_fallback", null, {
            clob_error: orderResult.error?.substring(0, 200),
            clob_status: orderResult.status,
            error_code: errorCode,
          });

          return json({
            error: errorMsg,
            error_code: errorCode,
            trade_order_id: tradeOrderId,
          }, isGeoBlock ? 403 : 502);
        }

        console.log(
          `[prediction-submit] Polymarket order: user=${normalizedWallet}, token=${tokenId}, amount=$${net_amount_usdc}, price=${expectedPrice}, status=${polymarket_status}, fee_collected=${feeCollected}`,
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
        source_operator_id: source_operator_id || fight.operator_id || null,
      })
      .select()
      .single();

    // ── OPERATOR REVENUE TRACKING ──
    const resolvedOperatorId = source_operator_id || fight.operator_id || null;
    if (resolvedOperatorId && entry) {
      try {
        const platformFeeBps = 150;
        const platformFeeUsd = Number(((parsedAmount * platformFeeBps) / 10_000).toFixed(6));
        const operatorFeeUsd = Math.max(0, Number((fee_usd - platformFeeUsd).toFixed(6)));

        await supabase.from("operator_revenue").insert({
          operator_id: resolvedOperatorId,
          fight_id,
          entry_id: entry.id,
          trade_order_id: tradeOrderId,
          platform_fee_usdc: platformFeeUsd,
          operator_fee_usdc: operatorFeeUsd,
          total_fee_usdc: fee_usd,
          entry_amount_usdc: parsedAmount,
        });
      } catch (revErr) {
        console.warn("[prediction-submit] operator_revenue insert failed:", revErr);
      }
    }

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
      trade_order_id: tradeOrderId,
      trade_status: tradeStatus,
      requested_amount_usdc: parsedAmount,
      fee_usdc: fee_usd,
      net_amount_usdc,
      fee_bps: effectiveFeeBps,
      pm_fee_rate_bps: isPolymarketBacked ? (typeof pmFeeRateBps !== "undefined" ? pmFeeRateBps : 0) : undefined,
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
