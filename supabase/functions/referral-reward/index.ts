/**
 * Referral Reward Recording
 * Called internally after settlement to record referral rewards.
 * NOT called by client directly.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Referral reward = 20% of platform fee
const REFERRAL_REWARD_BPS = 2000; // 20% in basis points

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const {
      players,
      sourceType,
      sourceId,
      wagerLamports,
      platformFeeLamports,
    } = await req.json();

    if (!players || !Array.isArray(players) || !sourceId || !platformFeeLamports) {
      return Response.json({ success: false, error: "missing_fields" }, { headers: corsHeaders });
    }

    let rewardsRecorded = 0;

    // Check each player for a referrer
    for (const playerWallet of players) {
      const { data: profile } = await supabase
        .from("player_profiles")
        .select("referred_by_wallet")
        .eq("wallet", playerWallet)
        .maybeSingle();

      if (!profile?.referred_by_wallet) continue;

      const referrerWallet = profile.referred_by_wallet;

      // Calculate referral reward: 20% of platform fee per player
      const perPlayerFee = Math.floor(platformFeeLamports / players.length);
      const rewardAmount = Math.floor((perPlayerFee * REFERRAL_REWARD_BPS) / 10000);

      if (rewardAmount <= 0) continue;

      // Insert reward record (idempotent via source_id + player)
      const { error: insertErr } = await supabase
        .from("referral_rewards")
        .insert({
          referrer_wallet: referrerWallet,
          player_wallet: playerWallet,
          source_type: sourceType || "skill_game",
          source_id: sourceId,
          wager_amount: wagerLamports || 0,
          platform_fee_amount: perPlayerFee,
          referral_reward_amount: rewardAmount,
          status: "accrued",
        });

      if (insertErr) {
        console.error("[referral-reward] Insert failed:", insertErr);
      } else {
        rewardsRecorded++;
        console.log("[referral-reward] ✅ Reward recorded:", {
          referrer: referrerWallet.slice(0, 8),
          player: playerWallet.slice(0, 8),
          reward: rewardAmount,
        });
      }
    }

    return Response.json(
      { success: true, rewardsRecorded },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[referral-reward] Error:", err);
    return Response.json(
      { success: false, error: "server_error" },
      { headers: corsHeaders, status: 500 }
    );
  }
});
