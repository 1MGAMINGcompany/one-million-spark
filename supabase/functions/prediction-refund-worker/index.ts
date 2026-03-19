import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Safety guardrails (USD-based) ──
const MAX_REFUND_USD = 500;
const DAILY_CEILING_USD = 5_000;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { fight_id, wallet } = body;

    if (!fight_id || !wallet) {
      return json({ error: "Missing fight_id or wallet" }, 400);
    }

    // Verify admin
    const { data: admin } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", wallet)
      .single();

    if (!admin) {
      return json({ error: "Unauthorized" }, 403);
    }

    // Get fight
    const { data: fight, error: fErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fErr || !fight) return json({ error: "Fight not found" }, 404);

    if (fight.status !== "refund_pending") {
      return json({ error: "Fight must be in refund_pending status" }, 400);
    }

    // Set to processing
    await supabase
      .from("prediction_fights")
      .update({ status: "refunds_processing", refund_status: "processing" })
      .eq("id", fight_id);

    // Get all unclaimed entries
    const { data: entries, error: eErr } = await supabase
      .from("prediction_entries")
      .select("*")
      .eq("fight_id", fight_id)
      .eq("claimed", false);

    if (eErr) throw eErr;

    if (!entries || entries.length === 0) {
      await supabase
        .from("prediction_fights")
        .update({
          status: "refunds_complete",
          refund_status: "complete",
          refunds_completed_at: new Date().toISOString(),
        })
        .eq("id", fight_id);

      return json({ success: true, refunded: 0 });
    }

    // ── TODO: Polymarket integration point ──
    // When Polymarket is connected:
    // 1. Cancel/redeem Polymarket positions for each entry
    // 2. Transfer USDC back to user wallets on Polygon
    // For now, mark entries as refunded with their pool_usd amount.

    let refundedCount = 0;
    let failedCount = 0;
    const failedEntries: string[] = [];

    for (const entry of entries) {
      // Prefer USD, fall back to legacy lamports conversion
      const refundUsd = Number(entry.pool_usd) > 0
        ? Number(entry.pool_usd)
        : Number(entry.pool_lamports) / 1_000_000_000;

      if (refundUsd <= 0) continue;

      // Per-refund cap
      if (refundUsd > MAX_REFUND_USD) {
        failedEntries.push(entry.id);
        failedCount++;
        continue;
      }

      try {
        // Mark as refunded
        await supabase
          .from("prediction_entries")
          .update({
            claimed: true,
            reward_usd: refundUsd,
            reward_lamports: 0,
          })
          .eq("id", entry.id);

        refundedCount++;
      } catch (err) {
        console.error(`Refund failed for entry ${entry.id}:`, err);
        failedEntries.push(entry.id);
        failedCount++;
      }
    }

    // Update fight status
    if (failedCount === 0) {
      await supabase
        .from("prediction_fights")
        .update({
          status: "refunds_complete",
          refund_status: "complete",
          refunds_completed_at: new Date().toISOString(),
        })
        .eq("id", fight_id);
    } else {
      await supabase
        .from("prediction_fights")
        .update({ refund_status: "failed" })
        .eq("id", fight_id);
    }

    return json({
      success: failedCount === 0,
      refunded: refundedCount,
      failed: failedCount,
      failed_entries: failedEntries,
      payout_method: "pending_polymarket",
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
