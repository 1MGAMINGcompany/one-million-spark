/**
 * clobOrderClient — Browser-side order submission using the official Polymarket SDK.
 *
 * This replaces manual EIP-712 signing + HMAC auth with the canonical
 * @polymarket/clob-client, eliminating serializer drift.
 *
 * Architecture: browser derives credentials → browser signs locally via SDK →
 * browser POSTs directly to CLOB (user's residential IP bypasses geo-block).
 */

import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

const CLOB_HOST = "https://clob.polymarket.com";
const POLYGON_CHAIN_ID = 137;
const SDK_TIMEOUT_MS = 30_000; // 30 seconds

export interface ClobOrderParams {
  token_id: string;
  price: number;
  net_amount_usdc: number;
  fee_rate_bps?: number;
  neg_risk?: boolean;
}

export interface ClobCredentials {
  api_key: string;
  api_secret: string;
  passphrase: string;
  trading_key: string;
  proxy_address?: string;
  funder_address?: string;
}

export interface ClobSubmitResult {
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
  errorCode?: string;
  diagnostics?: {
    signatureType: number;
    funder: string;
    maker: string;
    signer: string;
    orderType: string;
    exchange: string;
    httpStatus?: number;
    usedOfficialClient: boolean;
    negRisk: boolean;
    price: number;
  };
}

/**
 * Submit a market order to Polymarket CLOB using the official SDK.
 * The SDK handles EIP-712 signing, HMAC auth, fee rate, exchange selection, and payload serialization.
 */
export async function submitClobOrder(
  params: ClobOrderParams,
  credentials: ClobCredentials,
): Promise<ClobSubmitResult> {
  try {
    // Build viem wallet client from trading key
    const account = privateKeyToAccount(credentials.trading_key as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(),
    });

    // Determine auth model:
    // signatureType 0 = EOA — funder = signer address (per Polymarket quickstart)
    // signatureType 1 = POLY_PROXY (safe/proxy) — funder = proxy owner address
    const useProxy = !!credentials.proxy_address;
    const signatureType = useProxy ? 1 : 0;
    // EOA: funder = signer's own address (required by Polymarket)
    // POLY_PROXY: funder = the proxy/safe address
    const funder = useProxy ? credentials.proxy_address : account.address;

    const creds = {
      key: credentials.api_key,
      secret: credentials.api_secret,
      passphrase: credentials.passphrase,
    };

    // Construct official CLOB client
    let client: ClobClient;
    try {
      client = new ClobClient(
        CLOB_HOST,
        POLYGON_CHAIN_ID,
        walletClient,
        creds,
        signatureType,
        funder,
      );
    } catch (initErr: any) {
      console.error("[clobOrderClient] SDK construction failed:", initErr);
      return {
        success: false,
        error: `SDK init failed: ${initErr?.message || String(initErr)}`,
        errorCode: "sdk_init_failed",
        status: "failed",
        diagnostics: {
          signatureType,
          funder: funder || "none",
          maker: account.address,
          signer: account.address,
          orderType: "FOK",
          exchange: "unknown",
          usedOfficialClient: true,
          negRisk: params.neg_risk ?? true,
          price: params.price,
        },
      };
    }

    const negRisk = params.neg_risk ?? true; // sports markets are neg_risk
    const price = params.price;

    const diagnostics = {
      signatureType,
      funder: funder || "none",
      maker: useProxy ? (credentials.proxy_address as string) : account.address,
      signer: account.address,
      orderType: "FOK",
      exchange: negRisk ? "NegRiskCTFExchange" : "CTFExchange",
      usedOfficialClient: true,
      negRisk,
      price,
    };

    console.log("[clobOrderClient] SDK order submission:", JSON.stringify({
      ...diagnostics,
      tokenID: params.token_id.substring(0, 20) + "...",
      amount: params.net_amount_usdc,
      apiKeyPrefix: credentials.api_key.substring(0, 8),
    }));

    // Use the official SDK with a timeout to prevent hanging forever
    const orderPromise = client.createAndPostMarketOrder(
      {
        tokenID: params.token_id,
        amount: params.net_amount_usdc,
        price,
        side: Side.BUY,
      },
      { tickSize: "0.01", negRisk },
      OrderType.FOK,
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SDK_TIMEOUT")), SDK_TIMEOUT_MS)
    );

    const resp = await Promise.race([orderPromise, timeoutPromise]);

    console.log("[clobOrderClient] SDK response:", JSON.stringify(resp).substring(0, 500));

    // Extract order ID from response
    const orderId = resp?.orderID || resp?.orderIds?.[0] || resp?.id || null;

    return {
      success: !!orderId,
      orderId: orderId || undefined,
      status: orderId ? "submitted" : "accepted",
      diagnostics,
    };
  } catch (err: any) {
    console.error("[clobOrderClient] SDK order error:", err);

    // Detect timeout
    if (err?.message === "SDK_TIMEOUT") {
      return {
        success: false,
        error: "Order timed out after 30 seconds — the SDK did not respond. Please try again.",
        errorCode: "sdk_timeout",
        status: "failed",
        diagnostics: {
          signatureType: 0,
          funder: "unknown",
          maker: "unknown",
          signer: "unknown",
          orderType: "FOK",
          exchange: "unknown",
          usedOfficialClient: true,
          negRisk: params.neg_risk ?? true,
          price: params.price,
        },
      };
    }

    // Try to extract structured error info
    const errMsg = err?.message || err?.response?.data || String(err);
    const errStr = typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg);

    // Also capture HTTP response details if available
    const httpStatus = err?.response?.status || err?.status;
    const responseBody = err?.response?.data
      ? (typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data))
      : undefined;

    if (responseBody) {
      console.error("[clobOrderClient] Response body:", responseBody.substring(0, 500));
    }

    const isGeoBlock =
      errStr.toLowerCase().includes("restricted") ||
      errStr.toLowerCase().includes("region") ||
      httpStatus === 403;

    return {
      success: false,
      error: errStr.substring(0, 1000),
      errorCode: isGeoBlock ? "clob_geo_blocked" : "clob_rejected",
      status: "failed",
      diagnostics: {
        signatureType: 0,
        funder: "none",
        maker: "unknown",
        signer: "unknown",
        orderType: "FOK",
        exchange: "unknown",
        usedOfficialClient: true,
        negRisk: params.neg_risk ?? true,
        httpStatus,
        price: params.price,
      },
    };
  }
}
