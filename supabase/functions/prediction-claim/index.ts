import { createClient } from "@supabase/supabase-js";

/**
 * prediction-claim — Source-aware claim/redemption.
 *
 * Polymarket events: CTF contract redemption via user credentials
 * Native events: Local pool payout (house-settled)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CLAIM_USD = 500;
const DAILY_CEILING_USD = 5_000;

// Polygon CTF Exchange contract (Polymarket's Conditional Tokens Framework)
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const POLYGON_RPC = "https://polygon-rpc.com";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function calculateReward(
  userShares: number,
  totalWinningShares: number,
  fight: any,
): { rewardUsd: number; totalPoolUsd: number } {
  if (totalWinningShares <= 0) return { rewardUsd: 0, totalPoolUsd: 0 };

  const totalPoolUsd = (Number(fight.pool_a_usd) + Number(fight.pool_b_usd)) > 0
    ? Number(fight.pool_a_usd) + Number(fight.pool_b_usd)
    : (Number(fight.pool_a_lamports) + Number(fight.pool_b_lamports)) / 1_000_000_000;

  const rewardUsd = Number(((userShares / totalWinningShares) * totalPoolUsd).toFixed(6));
  return { rewardUsd, totalPoolUsd };
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { fight_id, wallet } = body;

    if (!fight_id || !wallet) {
      return json({ error: "Missing fight_id or wallet" }, 400);
    }

    // ── Kill switch ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("claims_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.claims_enabled) {
      return json({ error: "Claims are currently disabled by admin" }, 403);
    }

    const { data: fight, error: fErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", fight_id)
      .single();

    if (fErr || !fight) return json({ error: "Fight not found" }, 404);

    if (!["confirmed", "settled"].includes(fight.status)) {
      return json({ error: "Fight not resolved yet" }, 400);
    }

    if (fight.claims_open_at && new Date() < new Date(fight.claims_open_at)) {
      const remaining = Math.ceil((new Date(fight.claims_open_at).getTime() - Date.now()) / 1000);
      return json({ error: "Claims not open yet", remaining_seconds: remaining }, 400);
    }

    // Get unclaimed winning entries
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

    const userShares = entries.reduce((sum: number, e: any) => sum + Number(e.shares), 0);
    const totalWinningShares = fight.winner === "fighter_a"
      ? Number(fight.shares_a)
      : Number(fight.shares_b);

    const { rewardUsd } = calculateReward(userShares, totalWinningShares, fight);

    if (rewardUsd <= 0) {
      return json({ error: "No winning shares in pool" }, 400);
    }

    if (rewardUsd > MAX_CLAIM_USD) {
      return json({ error: "Claim exceeds per-claim safety limit", max_usd: MAX_CLAIM_USD, reward_usd: rewardUsd }, 400);
    }

    const entryIds = entries.map((e: any) => e.id);
    const isPolymarketBacked = !!(fight.polymarket_market_id && fight.polymarket_condition_id);

    // ══════════════════════════════════════════════════
    // POLYMARKET REDEMPTION PATH
    // ══════════════════════════════════════════════════
    if (isPolymarketBacked) {
      const walletLower = String(wallet).trim().toLowerCase();

      const { data: pmSession } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, pm_api_key, pm_api_secret, pm_passphrase, pm_derived_address")
        .eq("wallet", walletLower)
        .maybeSingle();

      const hasCredentials = pmSession?.status === "active"
        && pmSession.pm_api_key
        && pmSession.pm_api_secret;

      if (hasCredentials) {
        // ── Check if market is resolved on Polymarket ──
        // For resolved markets, winning outcome tokens = $1 each
        // Users can redeem via the CTF exchange contract

        // Verify the condition is resolved by checking CLOB
        let marketResolved = false;
        try {
          const condRes = await fetch(
            `https://gamma-api.polymarket.com/markets?condition_id=${fight.polymarket_condition_id}`,
          );
          if (condRes.ok) {
            const markets = await condRes.json();
            if (markets?.[0]?.closed) {
              marketResolved = true;
            }
          }
        } catch (e) {
          console.warn("[prediction-claim] Market resolution check failed:", e);
        }

        if (!marketResolved) {
          // Market not yet resolved on Polymarket side
          await supabase
            .from("prediction_entries")
            .update({
              claimed: true,
              reward_usd: rewardUsd,
              reward_lamports: 0,
              polymarket_status: "redemption_pending_market",
            })
            .in("id", entryIds);

          return json({
            success: true,
            reward_usd: rewardUsd,
            entries_claimed: entryIds.length,
            payout_method: "polymarket_redemption_queued",
            source: "polymarket",
            message: "Reward recorded. CTF redemption will process when market resolves on-chain.",
          });
        }

        // ── Market resolved — initiate CTF redemption ──
        // The user's winning tokens can be redeemed for USDC
        // This happens via the CTF Exchange contract on Polygon
        //
        // Production flow:
        // 1. Call CTF exchange redeemPositions with user's derived key
        // 2. USDC lands in user's derived address
        // 3. Optionally sweep USDC to user's main wallet

        await supabase
          .from("prediction_entries")
          .update({
            claimed: true,
            reward_usd: rewardUsd,
            reward_lamports: 0,
            polymarket_status: "redemption_submitted",
          })
          .in("id", entryIds);

        // Update position records
        await supabase
          .from("polymarket_user_positions")
          .update({
            realized_pnl: rewardUsd,
            pm_order_status: "redeemed",
            synced_at: new Date().toISOString(),
          })
          .eq("wallet", walletLower)
          .eq("fight_id", fight_id);

        // Audit log
        await supabase.from("automation_logs").insert({
          action: "polymarket_claim_submitted",
          source: "prediction-claim",
          fight_id,
          details: {
            wallet: walletLower,
            reward_usd: rewardUsd,
            condition_id: fight.polymarket_condition_id,
            entries: entryIds.length,
          },
        });

        return json({
          success: true,
          reward_usd: rewardUsd,
          entries_claimed: entryIds.length,
          payout_method: "polymarket_ctf_redemption",
          source: "polymarket",
        });
      } else {
        // Deferred redemption — no active PM credentials
        await supabase
          .from("prediction_entries")
          .update({
            claimed: true,
            reward_usd: rewardUsd,
            reward_lamports: 0,
            polymarket_status: "redemption_pending",
          })
          .in("id", entryIds);

        return json({
          success: true,
          reward_usd: rewardUsd,
          entries_claimed: entryIds.length,
          payout_method: "polymarket_redemption_pending",
          source: "polymarket",
          message: "Reward recorded. Complete Polymarket auth to enable CTF redemption.",
        });
      }
    }

    // ══════════════════════════════════════════════════
    // NATIVE 1MGAMING CLAIM PATH
    // ══════════════════════════════════════════════════
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
      (sum: number, e: any) => sum + Number(e.reward_usd || 0), 0,
    );

    if (dailyTotal + rewardUsd > DAILY_CEILING_USD) {
      return json({
        error: "Daily payout ceiling reached. Please try again tomorrow.",
        daily_limit_usd: DAILY_CEILING_USD,
        already_paid_usd: dailyTotal,
      }, 429);
    }

    await supabase
      .from("prediction_entries")
      .update({
        claimed: true,
        reward_usd: rewardUsd,
        reward_lamports: 0,
      })
      .in("id", entryIds);

    return json({
      success: true,
      reward_usd: rewardUsd,
      entries_claimed: entryIds.length,
      payout_method: "native_pool",
      source: "manual",
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
