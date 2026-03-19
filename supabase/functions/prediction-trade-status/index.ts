import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

/**
 * prediction-trade-status — Secure read endpoint for a single trade order.
 *
 * Auth: Privy JWT verification via JWKS.
 * Ownership: Resolved server-side by looking up the caller's privy_did
 * in prediction_accounts to get the trusted wallet, then matching against
 * prediction_trade_orders.wallet. Falls back to request-body wallet ONLY
 * if no prediction_accounts record exists for this DID (temporary compat).
 *
 * Returns minimal safe fields only.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Privy JWKS setup (cached per isolate lifetime) ──
const PRIVY_JWKS_URL = new URL("https://auth.privy.io/.well-known/jwks.json");
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!_jwks) _jwks = createRemoteJWKSet(PRIVY_JWKS_URL);
  return _jwks;
}

async function verifyPrivyToken(token: string, appId: string) {
  const jwks = getJWKS();
  const { payload } = await jwtVerify(token, jwks, {
    issuer: "privy.io",
    audience: appId,
  });
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Privy JWT verification ──
    const privyToken = req.headers.get("x-privy-token");
    if (!privyToken || privyToken.length < 20) {
      return json({ error: "Authentication required", error_code: "auth_required" }, 401);
    }

    const appId = Deno.env.get("VITE_PRIVY_APP_ID");
    if (!appId) {
      console.error("[prediction-trade-status] VITE_PRIVY_APP_ID not configured");
      return json({ error: "Internal configuration error" }, 500);
    }

    let claims: Awaited<ReturnType<typeof verifyPrivyToken>>;
    try {
      claims = await verifyPrivyToken(privyToken, appId);
    } catch (err) {
      console.warn("[prediction-trade-status] Privy JWT verification failed:", (err as Error).message);
      return json({ error: "Invalid or expired authentication token", error_code: "auth_invalid" }, 401);
    }

    const privyDid = claims.sub; // e.g. "did:privy:xxxxx"
    if (!privyDid) {
      return json({ error: "Invalid token: missing subject", error_code: "auth_invalid" }, 401);
    }

    const body = await req.json();
    const { trade_order_id, wallet: bodyWallet } = body;

    // ── Input validation ──
    if (!trade_order_id || typeof trade_order_id !== "string" || trade_order_id.length < 10) {
      return json({ error: "Missing or invalid trade_order_id" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Server-side wallet resolution from trusted Privy DID ──
    let trustedWallet: string | null = null;
    {
      const { data: account } = await supabase
        .from("prediction_accounts")
        .select("wallet_evm")
        .eq("privy_did", privyDid)
        .maybeSingle();

      if (account?.wallet_evm) {
        trustedWallet = account.wallet_evm.trim().toLowerCase();
      }
    }

    // TEMPORARY FALLBACK: If no prediction_accounts record exists for this DID,
    // accept the request-body wallet. This covers the window where a user has
    // authenticated but their DID hasn't been bound yet (e.g., first submission
    // is still in-flight). Remove this fallback once all active users have
    // privy_did bound in prediction_accounts.
    if (!trustedWallet && bodyWallet && typeof bodyWallet === "string" && bodyWallet.length >= 10) {
      console.warn(
        `[prediction-trade-status] No prediction_accounts record for DID ${privyDid?.slice(0, 20)}. ` +
        `Falling back to request-body wallet (temporary compat).`
      );
      trustedWallet = bodyWallet.trim().toLowerCase();
    }

    if (!trustedWallet) {
      return json({ error: "No wallet associated with this identity", error_code: "no_wallet" }, 403);
    }

    // ── Fetch trade order ──
    const { data: order, error } = await supabase
      .from("prediction_trade_orders")
      .select(
        "id, status, requested_amount_usdc, fee_usdc, filled_amount_usdc, filled_shares, avg_fill_price, created_at, finalized_at, reconciled_at, wallet",
      )
      .eq("id", trade_order_id)
      .maybeSingle();

    if (error) {
      console.error("[prediction-trade-status] DB error:", error.message);
      return json({ error: "Internal error" }, 500);
    }

    if (!order) {
      return json({ error: "Trade not found", error_code: "not_found" }, 404);
    }

    // ── Ownership check using server-resolved wallet ──
    const orderWallet = (order.wallet || "").trim().toLowerCase();
    if (orderWallet !== trustedWallet) {
      return json({ error: "Forbidden", error_code: "not_owner" }, 403);
    }

    // ── Compute net_amount_usdc ──
    const requestedUsdc = typeof order.requested_amount_usdc === "number" ? order.requested_amount_usdc : 0;
    const feeUsdc = typeof order.fee_usdc === "number" ? order.fee_usdc : 0;
    const netAmountUsdc = Math.max(0, requestedUsdc - feeUsdc);

    // ── Return safe response ──
    return json({
      trade_order_id: order.id,
      trade_status: order.status,
      requested_amount_usdc: requestedUsdc,
      fee_usdc: feeUsdc,
      net_amount_usdc: netAmountUsdc,
      filled_amount_usdc: order.filled_amount_usdc ?? 0,
      filled_shares: order.filled_shares ?? 0,
      avg_fill_price: order.avg_fill_price ?? null,
      created_at: order.created_at,
      finalized_at: order.finalized_at ?? null,
      reconciled_at: order.reconciled_at ?? null,
    });
  } catch (err) {
    console.error("[prediction-trade-status] Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
