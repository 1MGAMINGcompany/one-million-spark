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

    // Determine auth model
    const useProxy = !!credentials.proxy_address;
    const signatureType = useProxy ? 1 : 0; // 0=EOA, 1=POLY_PROXY
    const funder = useProxy ? credentials.funder_address : undefined;

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

    const diagnostics = {
      signatureType,
      funder: funder || "0x0000000000000000000000000000000000000000",
      maker: useProxy ? (credentials.proxy_address as string) : account.address,
      signer: account.address,
      orderType: "FOK",
      exchange: negRisk ? "NegRiskCTFExchange" : "CTFExchange",
      usedOfficialClient: true,
      negRisk,
    };

    console.log("[clobOrderClient] SDK order submission:", JSON.stringify({
      ...diagnostics,
      tokenID: params.token_id.substring(0, 20) + "...",
      amount: params.net_amount_usdc,
      apiKeyPrefix: credentials.api_key.substring(0, 8),
    }));

    // Use the official SDK to create, sign, and post the market order
    const resp = await client.createAndPostMarketOrder(
      {
        tokenID: params.token_id,
        amount: params.net_amount_usdc,
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

    const isGeoBlock =
      errStr.toLowerCase().includes("restricted") ||
      errStr.toLowerCase().includes("region") ||
      err?.response?.status === 403;

    return {
      success: false,
      error: errStr.substring(0, 1000),
      errorCode: isGeoBlock ? "clob_geo_blocked" : "clob_rejected",
      status: "failed",
      diagnostics: {
        signatureType: 0,
        funder: "0x0000000000000000000000000000000000000000",
        maker: "unknown",
        signer: "unknown",
        orderType: "FOK",
        exchange: "unknown",
        usedOfficialClient: true,
        negRisk: params.neg_risk ?? true,
        httpStatus: err?.response?.status,
      },
    };
  }
}
