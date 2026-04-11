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
    // signatureType 0 = EOA (no proxy), funder = undefined
    // signatureType 1 = POLY_PROXY (safe/proxy), funder = proxy owner address
    const useProxy = !!credentials.proxy_address;
    const signatureType = useProxy ? 1 : 0;
    // For POLY_PROXY, funder should be the proxy/safe address itself (the maker).
    // For EOA, funder must be undefined per SDK docs.
    const funder = useProxy ? credentials.proxy_address : undefined;

    const creds = {
      key: credentials.api_key,
      secret: credentials.api_secret,
      passphrase: credentials.passphrase,
    };

    // Construct official CLOB client
    const client = new ClobClient(
      CLOB_HOST,
      POLYGON_CHAIN_ID,
      walletClient,
      creds,
      signatureType,
      funder,
    );

    const negRisk = params.neg_risk ?? true; // sports markets are neg_risk

    // Price is the worst-price limit (slippage protection) — required for market orders.
    // The backend sends this as the expected price from the slippage check.
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

    // Use the official SDK to create, sign, and post the market order.
    // `price` acts as worst-price limit (slippage protection) per Polymarket docs.
    const resp = await client.createAndPostMarketOrder(
      {
        tokenID: params.token_id,
        amount: params.net_amount_usdc,
        price,
        side: Side.BUY,
      },
      { tickSize: "0.01", negRisk },
      OrderType.FOK,
    );

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
