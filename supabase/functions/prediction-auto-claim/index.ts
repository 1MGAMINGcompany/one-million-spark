import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi } from "viem";
import { polygon } from "viem/chains";

/**
 * prediction-auto-claim — Automatically pays out winning predictions.
 *
 * Runs on a schedule (cron). Finds all unclaimed winning entries where
 * claims_open_at has elapsed, and sends USDC from treasury to winners.
 * Processes up to BATCH_SIZE entries per invocation to avoid timeouts.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 10;
const MAX_CLAIM_USD = 500;
const DAILY_CEILING_USD = 5_000;

const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_DECIMALS = 6;
const POLYGON_RPC = "https://polygon-rpc.com";

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
): number {
  if (totalWinningShares <= 0) return 0;

  const totalPoolUsd =
    (Number(fight.pool_a_usd) + Number(fight.pool_b_usd)) > 0
      ? Number(fight.pool_a_usd) + Number(fight.pool_b_usd)
      : (Number(fight.pool_a_lamports) + Number(fight.pool_b_lamports)) / 1_000_000_000;

  return Number(((userShares / totalWinningShares) * totalPoolUsd).toFixed(6));
}

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

    // Check treasury balance
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

    const txData = encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [recipientWallet as `0x${string}`, amountRaw],
    });

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

    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(POLYGON_RPC),
    });

    const txHash = await walletClient.sendTransaction({
      to: USDC_CONTRACT as `0x${string}`,
      data: txData,
      gas: 100_000n,
      gasPrice: gasPrice * 12n / 10n,
      nonce,
      value: 0n,
    });

    console.log(`[auto-claim] USDC payout sent: ${txHash}, amount=$${amountUsd}, to=${recipientWallet}`);
    return { success: true, txHash };
  } catch (err) {
    console.error("[auto-claim] USDC transfer failed:", err);
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

    // ── Kill switch ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("claims_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.claims_enabled) {
      return json({ skipped: true, reason: "claims_disabled" });
    }

    // ── Daily ceiling check ──
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: dailyClaims } = await supabase
      .from("prediction_entries")
      .select("reward_usd")
      .eq("claimed", true)
      .not("reward_usd", "is", null)
      .gte("created_at", todayStart.toISOString());

    const dailyTotal = (dailyClaims || []).reduce(
      (sum: number, e: any) => sum + Number(e.reward_usd || 0), 0,
    );

    if (dailyTotal >= DAILY_CEILING_USD) {
      return json({ skipped: true, reason: "daily_ceiling_reached", daily_total: dailyTotal });
    }

    // ── Find confirmed/settled fights with claims_open_at elapsed ──
    const { data: claimableFights, error: fErr } = await supabase
      .from("prediction_fights")
      .select("*")
      .in("status", ["confirmed", "settled"])
      .not("winner", "is", null)
      .lte("claims_open_at", new Date().toISOString());

    if (fErr) throw fErr;
    if (!claimableFights || claimableFights.length === 0) {
      return json({ processed: 0, reason: "no_claimable_fights" });
    }

    let totalProcessed = 0;
    let totalPaid = 0;
    const errors: { wallet: string; fight_id: string; error: string }[] = [];

    for (const fight of claimableFights) {
      if (totalProcessed >= BATCH_SIZE) break;

      // Get unclaimed winning entries for this fight
      const { data: entries, error: eErr } = await supabase
        .from("prediction_entries")
        .select("*")
        .eq("fight_id", fight.id)
        .eq("fighter_pick", fight.winner)
        .eq("claimed", false)
        .limit(BATCH_SIZE - totalProcessed);

      if (eErr || !entries || entries.length === 0) continue;

      const totalWinningShares = fight.winner === "fighter_a"
        ? Number(fight.shares_a)
        : Number(fight.shares_b);

      // Group entries by wallet for batched payouts
      const walletEntries: Record<string, any[]> = {};
      for (const entry of entries) {
        if (!walletEntries[entry.wallet]) walletEntries[entry.wallet] = [];
        walletEntries[entry.wallet].push(entry);
      }

      for (const [wallet, wEntries] of Object.entries(walletEntries)) {
        if (totalProcessed >= BATCH_SIZE) break;

        const userShares = wEntries.reduce((sum: number, e: any) => sum + Number(e.shares), 0);
        const rewardUsd = calculateReward(userShares, totalWinningShares, fight);

        if (rewardUsd <= 0) continue;
        if (rewardUsd > MAX_CLAIM_USD) {
          // Skip oversized claims — admin should handle manually
          console.warn(`[auto-claim] Skipping oversized claim: $${rewardUsd} for ${wallet}`);
          continue;
        }

        if (dailyTotal + totalPaid + rewardUsd > DAILY_CEILING_USD) {
          console.warn(`[auto-claim] Daily ceiling would be exceeded, stopping`);
          break;
        }

        const entryIds = wEntries.map((e: any) => e.id);
        const payoutResult = await transferUsdcToWinner(wallet, rewardUsd);

        if (!payoutResult.success) {
          errors.push({ wallet, fight_id: fight.id, error: payoutResult.error || "unknown" });

          await supabase.from("automation_logs").insert({
            action: "auto_claim_payout_failed",
            source: "prediction-auto-claim",
            fight_id: fight.id,
            details: {
              wallet,
              reward_usd: rewardUsd,
              error: payoutResult.error,
              entries: entryIds.length,
            },
          });
          continue;
        }

        // Mark entries as claimed
        await supabase
          .from("prediction_entries")
          .update({
            claimed: true,
            reward_usd: rewardUsd,
            reward_lamports: 0,
            tx_signature: payoutResult.txHash,
          })
          .in("id", entryIds);

        // Audit log
        await supabase.from("automation_logs").insert({
          action: "auto_claim_paid",
          source: "prediction-auto-claim",
          fight_id: fight.id,
          details: {
            wallet,
            reward_usd: rewardUsd,
            tx_hash: payoutResult.txHash,
            entries: entryIds.length,
          },
        });

        totalProcessed += wEntries.length;
        totalPaid += rewardUsd;
      }
    }

    return json({
      processed: totalProcessed,
      total_paid_usd: totalPaid,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error("[auto-claim] Fatal error:", err);
    return json({ error: err.message }, 500);
  }
});
