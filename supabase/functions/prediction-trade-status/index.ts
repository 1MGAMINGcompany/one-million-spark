import { createClient } from "@supabase/supabase-js";

/**
 * prediction-trade-status — Secure read endpoint for a single trade order.
 *
 * Accepts: { trade_order_id, wallet }
 * Returns minimal safe fields only if the requesting wallet owns the trade.
 *
 * Auth: Wallet-based ownership check (same pattern as prediction-submit).
 * No secrets, no debug fields, no audit logs exposed.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { trade_order_id, wallet } = body;

    // ── Input validation ──
    if (!trade_order_id || typeof trade_order_id !== "string" || trade_order_id.length < 10) {
      return json({ error: "Missing or invalid trade_order_id" }, 400);
    }

    if (!wallet || typeof wallet !== "string" || wallet.length < 10) {
      return json({ error: "Missing or invalid wallet" }, 400);
    }

    const normalizedWallet = wallet.trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    // ── Ownership check ──
    const orderWallet = (order.wallet || "").trim().toLowerCase();
    if (orderWallet !== normalizedWallet) {
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
