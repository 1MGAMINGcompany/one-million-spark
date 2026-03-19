import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── V1 Safety Guardrails (USD-based) ──
const MAX_CLAIM_USD = 500;          // $500 per single claim
const DAILY_CEILING_USD = 5_000;    // $5,000 daily total payouts

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { fight_id, wallet } = body;

    if (!fight_id || !wallet) {
      return json({ error: "Missing fight_id or wallet" }, 400);
    }

    // ── Kill switch check ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("claims_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.claims_enabled) {
      return json({ error: "Claims are currently disabled by admin" }, 403);
    }

    // Get fight
    const { data: fight, error: fErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fErr || !fight) {
      return json({ error: "Fight not found" }, 404);
    }

    if (!["confirmed", "settled"].includes(fight.status)) {
      return json({ error: "Fight not resolved yet" }, 400);
    }

    // Check 5-minute delay
    if (fight.claims_open_at && new Date() < new Date(fight.claims_open_at)) {
      const remaining = Math.ceil((new Date(fight.claims_open_at).getTime() - Date.now()) / 1000);
      return json({ error: "Claims not open yet", remaining_seconds: remaining }, 400);
    }

    // Get user's entries for this fight on the winning side
    const { data: entries, error: eErr } = await supabase
      .from("prediction_entries")
      .select("*")
      .eq("fight_id", fight_id)
      .eq("wallet", wallet)
      .eq("fighter_pick", fight.winner)
      .eq("claimed", false);

    if (eErr) throw eErr;

    if (!entries || entries.length === 0) {
      return json({ error: "No unclaimed winning predictions" }, 400);
    }

    // Calculate total user shares
    const userShares = entries.reduce((sum: number, e: any) => sum + Number(e.shares), 0);

    // Total winning pool shares
    const totalWinningShares = fight.winner === "fighter_a"
      ? Number(fight.shares_a)
      : Number(fight.shares_b);

    if (totalWinningShares <= 0) {
      return json({ error: "No winning shares in pool" }, 400);
    }

    // Total pool (both sides, USD-first with legacy fallback)
    const totalPoolUsd = (Number(fight.pool_a_usd) + Number(fight.pool_b_usd)) > 0
      ? Number(fight.pool_a_usd) + Number(fight.pool_b_usd)
      : (Number(fight.pool_a_lamports) + Number(fight.pool_b_lamports)) / 1_000_000_000;

    // User reward in USD
    const rewardUsd = Number(((userShares / totalWinningShares) * totalPoolUsd).toFixed(6));

    // ── GUARDRAIL 1: Per-claim cap ──
    if (rewardUsd > MAX_CLAIM_USD) {
      return json({
        error: "Claim exceeds per-claim safety limit",
        max_usd: MAX_CLAIM_USD,
        reward_usd: rewardUsd,
      }, 400);
    }

    // ── GUARDRAIL 2: Daily payout ceiling ──
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: dailyClaims, error: dcErr } = await supabase
      .from("prediction_entries")
      .select("reward_usd")
      .eq("claimed", true)
      .not("reward_usd", "is", null)
      .gte("created_at", todayStart.toISOString());

    if (dcErr) throw dcErr;

    const dailyTotal = (dailyClaims || []).reduce(
      (sum: number, e: any) => sum + Number(e.reward_usd || 0), 0
    );

    if (dailyTotal + rewardUsd > DAILY_CEILING_USD) {
      return json({
        error: "Daily payout ceiling reached. Please try again tomorrow.",
        daily_limit_usd: DAILY_CEILING_USD,
        already_paid_usd: dailyTotal,
      }, 429);
    }

    // ── TODO: Polymarket integration point ──
    // When Polymarket is connected, execute the payout here:
    // 1. Redeem winning Polymarket shares
    // 2. Transfer USDC to user's wallet on Polygon
    // 3. Record the tx hash on the entry
    // For now, we mark entries as claimed with the calculated reward.
    // Manual payouts can be processed by admin.

    // Mark entries as claimed
    const entryIds = entries.map((e: any) => e.id);
    await supabase
      .from("prediction_entries")
      .update({
        claimed: true,
        reward_usd: rewardUsd,
        // Legacy field for backward compat
        reward_lamports: 0,
      })
      .in("id", entryIds);

    return json({
      success: true,
      reward_usd: rewardUsd,
      entries_claimed: entryIds.length,
      // No on-chain signature yet — will be added with Polymarket integration
      payout_method: "pending_polymarket",
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
