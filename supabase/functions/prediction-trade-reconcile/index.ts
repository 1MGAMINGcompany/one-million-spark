import { createClient } from "@supabase/supabase-js";

/**
 * prediction-trade-reconcile — Reconcile prediction_trade_orders against
 * Polymarket CLOB order status.
 *
 * Data source: CLOB /order/{id} endpoint (same pattern as polymarket-positions check_order).
 *
 * Designed for cron invocation or manual trigger.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const RECONCILE_WINDOW_HOURS = 72;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── HMAC auth for CLOB (reused from polymarket-positions pattern) ──

async function generateClobHmac(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body = "",
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

interface ClobCreds {
  pm_api_key: string;
  pm_api_secret: string;
  pm_passphrase: string;
}

async function clobHeaders(creds: ClobCreds, method: string, path: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await generateClobHmac(creds.pm_api_secret, timestamp, method, path);
  return {
    POLY_API_KEY: creds.pm_api_key,
    POLY_SIGNATURE: hmac,
    POLY_PASSPHRASE: creds.pm_passphrase,
    POLY_TIMESTAMP: timestamp,
    "Content-Type": "application/json",
  };
}

// ── Audit helper ──

async function audit(
  supabase: any,
  action: string,
  tradeOrderId: string | null,
  wallet: string | null,
  request: any = null,
  response: any = null,
) {
  try {
    await supabase.from("prediction_trade_audit_log").insert({
      trade_order_id: tradeOrderId,
      wallet,
      action,
      request_payload_json: request,
      response_payload_json: response,
    });
  } catch (e) {
    console.warn("[reconcile] audit write failed:", e);
  }
}

// ── Main ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const summary = {
    rows_scanned: 0,
    rows_updated: 0,
    rows_skipped: 0,
    rows_failed: 0,
    errors: [] as string[],
  };

  try {
    await audit(supabase, "reconcile_started", null, null, {
      window_hours: RECONCILE_WINDOW_HOURS,
    });

    // ── 1. Fetch candidate trade orders ──
    const windowStart = new Date(
      Date.now() - RECONCILE_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: orders, error: ordersErr } = await supabase
      .from("prediction_trade_orders")
      .select("id, wallet, polymarket_order_id, status, filled_amount_usdc, filled_shares, avg_fill_price, requested_amount_usdc, fee_usdc")
      .in("status", ["submitted", "filled", "partial_fill"])
      .not("polymarket_order_id", "is", null)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(200);

    if (ordersErr) throw ordersErr;
    if (!orders || orders.length === 0) {
      await audit(supabase, "reconcile_result", null, null, null, { rows_scanned: 0 });
      return json({ ...summary, message: "No orders to reconcile" });
    }

    summary.rows_scanned = orders.length;

    // ── 2. Group by wallet to batch credential lookups ──
    const wallets = [...new Set(orders.map((o: any) => o.wallet))];

    // Fetch sessions for all relevant wallets
    const { data: sessions } = await supabase
      .from("polymarket_user_sessions")
      .select("wallet, pm_api_key, pm_api_secret, pm_passphrase, status")
      .in("wallet", wallets)
      .eq("status", "active");

    const sessionMap = new Map<string, ClobCreds>();
    for (const s of sessions || []) {
      if (s.pm_api_key && s.pm_api_secret && s.pm_passphrase) {
        sessionMap.set(s.wallet, {
          pm_api_key: s.pm_api_key,
          pm_api_secret: s.pm_api_secret,
          pm_passphrase: s.pm_passphrase,
        });
      }
    }

    // ── 3. Reconcile each order ──
    for (const order of orders) {
      const creds = sessionMap.get(order.wallet);
      if (!creds) {
        summary.rows_skipped++;
        continue; // no valid session — skip silently
      }

      try {
        const path = `/order/${order.polymarket_order_id}`;
        const headers = await clobHeaders(creds, "GET", path);
        const res = await fetch(`${CLOB_BASE}${path}`, { headers });

        if (!res.ok) {
          // API error — skip this order, don't fail batch
          summary.rows_failed++;
          summary.errors.push(`order=${order.id} clob_status=${res.status}`);
          await audit(supabase, "reconcile_failed", order.id, order.wallet, null, {
            clob_status: res.status,
          });
          continue;
        }

        const clobOrder = await res.json();

        // ── Map CLOB status to our lifecycle ──
        const clobStatus = (clobOrder.status || "").toUpperCase();
        let newStatus: string | null = null;
        const updates: Record<string, any> = {};

        if (clobStatus === "MATCHED" || clobStatus === "FILLED") {
          // Determine full vs partial fill
          const filledSize = Number(clobOrder.size_matched ?? clobOrder.original_size ?? 0);
          const originalSize = Number(clobOrder.original_size ?? 0);
          const isPartial = originalSize > 0 && filledSize < originalSize;

          newStatus = isPartial ? "partial_fill" : "filled";

          // Update fill fields only if we have better data
          if (filledSize > 0) {
            const avgPrice = Number(clobOrder.price ?? clobOrder.average_price ?? 0);
            const filledUsdc = avgPrice > 0 ? filledSize * avgPrice : Number(order.filled_amount_usdc || 0);

            updates.filled_shares = filledSize;
            updates.filled_amount_usdc = filledUsdc;
            if (avgPrice > 0) updates.avg_fill_price = avgPrice;
          }

          updates.finalized_at = updates.finalized_at || new Date().toISOString();
        } else if (clobStatus === "CANCELED" || clobStatus === "CANCELLED") {
          newStatus = "cancelled";
          updates.finalized_at = new Date().toISOString();
          updates.error_code = "clob_cancelled";
        } else if (clobStatus === "LIVE" || clobStatus === "OPEN") {
          // Still pending — keep as submitted, no update needed
          newStatus = "submitted";
        } else {
          // Unknown status — log but don't change
          summary.rows_skipped++;
          await audit(supabase, "reconcile_result", order.id, order.wallet, null, {
            action: "skipped_unknown_status",
            clob_status: clobStatus,
          });
          continue;
        }

        // Only update if status actually changed or we have new fill data
        const hasStatusChange = newStatus !== order.status;
        const hasNewFillData = Object.keys(updates).length > 0;

        if (!hasStatusChange && !hasNewFillData) {
          summary.rows_skipped++;
          continue;
        }

        // Apply update
        const updatePayload: Record<string, any> = {
          ...updates,
          reconciled_at: new Date().toISOString(),
        };
        if (hasStatusChange && newStatus) {
          updatePayload.status = newStatus;
        }

        const { error: updateErr } = await supabase
          .from("prediction_trade_orders")
          .update(updatePayload)
          .eq("id", order.id);

        if (updateErr) {
          summary.rows_failed++;
          summary.errors.push(`order=${order.id} update_err=${updateErr.message}`);
          await audit(supabase, "reconcile_failed", order.id, order.wallet, null, {
            error: updateErr.message,
          });
        } else {
          summary.rows_updated++;
          await audit(supabase, "reconcile_result", order.id, order.wallet, null, {
            prev_status: order.status,
            new_status: newStatus,
            clob_status: clobStatus,
            filled_shares: updates.filled_shares ?? null,
          });
        }
      } catch (err: any) {
        summary.rows_failed++;
        summary.errors.push(`order=${order.id} err=${err.message}`);
        await audit(supabase, "reconcile_failed", order.id, order.wallet, null, {
          error: err.message,
        });
      }
    }

    return json(summary);
  } catch (err: any) {
    console.error("[reconcile] Fatal:", err);
    await audit(supabase, "reconcile_failed", null, null, null, { error: err.message });
    return json({ error: err.message, ...summary }, 500);
  }
});
