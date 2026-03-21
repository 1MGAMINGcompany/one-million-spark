import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi } from "viem";
import { polygon } from "viem/chains";

/**
 * prediction-claim — Source-aware claim/redemption with on-chain USDC payout.
 *
 * Polymarket events: CTF contract redemption via shared credentials
 * Native events: USDC transfer from treasury to winner's wallet
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CLAIM_USD = 500;
const DAILY_CEILING_USD = 5_000;

const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";
const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_DECIMALS = 6;
const POLYGON_RPC = "https://polygon-rpc.com";

// Polygon CTF Exchange contract (Polymarket's Conditional Tokens Framework)
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";

const erc20TransferAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

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

/**
 * Transfer USDC from treasury to the winner's wallet on Polygon.
 * Uses the same FEE_RELAYER_PRIVATE_KEY that collects fees.
 */
async function transferUsdcToWinner(
  recipientWallet: string,
  amountUsd: number,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (!relayerKey) {
    return { success: false, error: "relayer_key_not_configured" };
  }

  try {
    const account = privateKeyToAccount(
      (relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`) as `0x${string}`,
    );

    const amountRaw = BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));

    // Check treasury USDC balance first
    const balanceData = encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: "balanceOf",
      args: [account.address],
    });

    const balanceRes = await fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{ to: USDC_CONTRACT, data: balanceData }, "latest"],
      }),
    });
    const balanceJson = await balanceRes.json();
    if (balanceJson.result) {
      const balance = BigInt(balanceJson.result);
      if (balance < amountRaw) {
        return {
          success: false,
          error: `insufficient_treasury_balance: have ${balance}, need ${amountRaw}`,
        };
      }
    }

    // Encode transfer(recipient, amount)
    const txData = encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [recipientWallet as `0x${string}`, amountRaw],
    });

    // Get nonce
    const nonceRes = await fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2,
        method: "eth_getTransactionCount",
        params: [account.address, "latest"],
      }),
    });
    const nonceJson = await nonceRes.json();
    const nonce = Number(BigInt(nonceJson.result));

    // Get gas price
    const gasPriceRes = await fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 3,
        method: "eth_gasPrice",
        params: [],
      }),
    });
    const gasPriceJson = await gasPriceRes.json();
    const gasPrice = BigInt(gasPriceJson.result);

    // Send transaction
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(POLYGON_RPC),
    });

    const txHash = await walletClient.sendTransaction({
      to: USDC_CONTRACT as `0x${string}`,
      data: txData,
      gas: 100_000n,
      gasPrice: gasPrice * 12n / 10n, // 20% buffer
      nonce,
      value: 0n,
    });

    console.log(`[prediction-claim] USDC payout sent: ${txHash}, amount=$${amountUsd}, to=${recipientWallet}`);
    return { success: true, txHash };
  } catch (err) {
    console.error("[prediction-claim] USDC payout transfer failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

        // ── Market resolved — send USDC payout from treasury ──
        const payoutResult = await transferUsdcToWinner(walletLower, rewardUsd);

        if (!payoutResult.success) {
          // Don't mark as claimed if payout failed
          await supabase.from("automation_logs").insert({
            action: "polymarket_claim_payout_failed",
            source: "prediction-claim",
            fight_id,
            details: {
              wallet: walletLower,
              reward_usd: rewardUsd,
              error: payoutResult.error,
              entries: entryIds.length,
            },
          });

          return json({
            error: "Payout transfer failed. Your claim has been saved and will be retried.",
            detail: payoutResult.error,
          }, 502);
        }

        await supabase
          .from("prediction_entries")
          .update({
            claimed: true,
            reward_usd: rewardUsd,
            reward_lamports: 0,
            polymarket_status: "redemption_submitted",
            tx_signature: payoutResult.txHash,
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
          action: "polymarket_claim_paid",
          source: "prediction-claim",
          fight_id,
          details: {
            wallet: walletLower,
            reward_usd: rewardUsd,
            tx_hash: payoutResult.txHash,
            condition_id: fight.polymarket_condition_id,
            entries: entryIds.length,
          },
        });

        return json({
          success: true,
          reward_usd: rewardUsd,
          entries_claimed: entryIds.length,
          payout_method: "polymarket_ctf_redemption",
          payout_tx: payoutResult.txHash,
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
    // NATIVE 1MGAMING CLAIM PATH — USDC transfer to winner
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

    // Execute on-chain USDC transfer from treasury to winner
    const payoutResult = await transferUsdcToWinner(wallet, rewardUsd);

    if (!payoutResult.success) {
      // Don't mark as claimed if payout failed — user can retry
      await supabase.from("automation_logs").insert({
        action: "native_claim_payout_failed",
        source: "prediction-claim",
        fight_id,
        details: {
          wallet,
          reward_usd: rewardUsd,
          error: payoutResult.error,
          entries: entryIds.length,
        },
      });

      return json({
        error: "Payout transfer failed. Please try again shortly.",
        detail: payoutResult.error,
      }, 502);
    }

    await supabase
      .from("prediction_entries")
      .update({
        claimed: true,
        reward_usd: rewardUsd,
        reward_lamports: 0,
        tx_signature: payoutResult.txHash,
      })
      .in("id", entryIds);

    // Audit log for native payout
    await supabase.from("automation_logs").insert({
      action: "native_claim_paid",
      source: "prediction-claim",
      fight_id,
      details: {
        wallet,
        reward_usd: rewardUsd,
        tx_hash: payoutResult.txHash,
        entries: entryIds.length,
      },
    });

    return json({
      success: true,
      reward_usd: rewardUsd,
      entries_claimed: entryIds.length,
      payout_method: "native_pool",
      payout_tx: payoutResult.txHash,
      source: "manual",
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
