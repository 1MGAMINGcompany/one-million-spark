import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi } from "viem";
import { polygon } from "viem/chains";

/**
 * prediction-auto-claim — Automatically pays out winning predictions.
 *
 * Polymarket events: Uses trade order data for reward calculation (filled_shares × $1.00),
 *   then redeems CTF tokens and withdraws USDC from derived EOA.
 * Native events: Uses parimutuel math + treasury USDC transfer.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 10;
const MAX_CLAIM_USD = 500;
const DAILY_CEILING_USD = 5_000;

const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_DECIMALS = 6;
const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const RPC_PROVIDERS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon.llamarpc.com",
  "https://polygon-rpc.com",
];

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const ctfAbi = parseAbi([
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
]);

async function callWithFallback<T>(fn: (rpc: string) => Promise<T>): Promise<T> {
  for (const rpc of RPC_PROVIDERS) {
    try { return await fn(rpc); }
    catch (e: any) { console.warn(`[auto-claim] RPC ${rpc} failed:`, e.message); }
  }
  throw new Error("All RPC providers failed");
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function padAddress(addr: string): string {
  return addr.slice(2).toLowerCase().padStart(64, "0");
}

// ── Native parimutuel reward ──
function calculateNativeReward(userShares: number, totalWinningShares: number, fight: any): number {
  if (totalWinningShares <= 0) return 0;
  const totalPoolUsd = (Number(fight.pool_a_usd) + Number(fight.pool_b_usd)) > 0
    ? Number(fight.pool_a_usd) + Number(fight.pool_b_usd)
    : (Number(fight.pool_a_lamports) + Number(fight.pool_b_lamports)) / 1_000_000_000;
  return Number(((userShares / totalWinningShares) * totalPoolUsd).toFixed(6));
}

// ── Gas funding ──
async function ensureGas(targetAddress: string): Promise<void> {
  const MIN_MATIC = 5_000_000_000_000_000n;
  const GAS_AMOUNT = 10_000_000_000_000_000n;

  const balJson = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [targetAddress, "latest"] }),
    });
    return await res.json();
  });

  if (BigInt(balJson.result || "0") >= MIN_MATIC) return;

  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (!relayerKey) return;

  const relayerAccount = privateKeyToAccount(
    (relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`) as `0x${string}`,
  );
  const nonceJson = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [relayerAccount.address, "latest"] }),
    });
    return await res.json();
  });

  const wc = createWalletClient({ account: relayerAccount, chain: polygon, transport: http(RPC_PROVIDERS[0]) });
  await wc.sendTransaction({
    to: targetAddress as `0x${string}`,
    value: GAS_AMOUNT,
    gas: 21_000n,
    nonce: Number(BigInt(nonceJson.result)),
  });
}

// ── CTF redemption ──
async function redeemCTF(
  account: ReturnType<typeof privateKeyToAccount>,
  conditionId: string,
): Promise<string | null> {
  try {
    const condBytes32 = (conditionId.startsWith("0x") ? conditionId : `0x${conditionId}`) as `0x${string}`;
    const txData = encodeFunctionData({
      abi: ctfAbi,
      functionName: "redeemPositions",
      args: [
        USDC_CONTRACT as `0x${string}`,
        "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        condBytes32,
        [1n, 2n],
      ],
    });

    const [gpJson, ncJson] = await Promise.all([
      callWithFallback(async (rpc) => {
        const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }) });
        return await r.json();
      }),
      callWithFallback(async (rpc) => {
        const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [account.address, "latest"] }) });
        return await r.json();
      }),
    ]);

    const wc = createWalletClient({ account, chain: polygon, transport: http(RPC_PROVIDERS[0]) });
    return await wc.sendTransaction({
      to: CTF_CONTRACT as `0x${string}`,
      data: txData,
      gas: 200_000n,
      gasPrice: BigInt(gpJson.result) * 12n / 10n,
      nonce: Number(BigInt(ncJson.result)),
      value: 0n,
    });
  } catch (err: any) {
    console.warn(`[auto-claim] CTF redemption note: ${err.message}`);
    return null;
  }
}

// ── USDC transfer from derived EOA → user wallet ──
async function withdrawFromDerived(
  tradingAccount: ReturnType<typeof privateKeyToAccount>,
  recipient: string,
): Promise<{ txHash?: string; amountUsdc: number }> {
  const balCallData = "0x70a08231" + padAddress(tradingAccount.address);
  const balResult = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_CONTRACT, data: balCallData }, "latest"] }),
    });
    return await res.json();
  });

  const balance = BigInt(balResult?.result || "0");
  if (balance <= 0n) return { amountUsdc: 0 };

  const txData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient as `0x${string}`, balance] });
  const [gpJson, ncJson] = await Promise.all([
    callWithFallback(async (rpc) => {
      const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }) });
      return await r.json();
    }),
    callWithFallback(async (rpc) => {
      const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [tradingAccount.address, "latest"] }) });
      return await r.json();
    }),
  ]);

  const wc = createWalletClient({ account: tradingAccount, chain: polygon, transport: http(RPC_PROVIDERS[0]) });
  const txHash = await wc.sendTransaction({
    to: USDC_CONTRACT as `0x${string}`,
    data: txData,
    gas: 100_000n,
    gasPrice: BigInt(gpJson.result) * 12n / 10n,
    nonce: Number(BigInt(ncJson.result)),
    value: 0n,
  });

  return { txHash, amountUsdc: Number(balance) / 10 ** USDC_DECIMALS };
}

// ── Native treasury transfer ──
async function transferUsdcFromTreasury(
  recipient: string,
  amountUsd: number,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (!relayerKey) return { success: false, error: "relayer_key_not_configured" };

  try {
    const account = privateKeyToAccount(
      (relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`) as `0x${string}`,
    );
    const amountRaw = BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));
    const txData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient as `0x${string}`, amountRaw] });

    const [ncJson, gpJson] = await Promise.all([
      callWithFallback(async (rpc) => {
        const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [account.address, "latest"] }) });
        return await r.json();
      }),
      callWithFallback(async (rpc) => {
        const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }) });
        return await r.json();
      }),
    ]);

    const wc = createWalletClient({ account, chain: polygon, transport: http(RPC_PROVIDERS[0]) });
    const txHash = await wc.sendTransaction({
      to: USDC_CONTRACT as `0x${string}`,
      data: txData,
      gas: 100_000n,
      gasPrice: BigInt(gpJson.result) * 12n / 10n,
      nonce: Number(BigInt(ncJson.result)),
      value: 0n,
    });

    return { success: true, txHash };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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

    // Kill switch
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("claims_enabled")
      .eq("id", "global")
      .single();
    if (settings && !settings.claims_enabled) {
      return json({ skipped: true, reason: "claims_disabled" });
    }

    // Daily ceiling
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: dailyClaims } = await supabase
      .from("prediction_entries")
      .select("reward_usd")
      .eq("claimed", true)
      .not("reward_usd", "is", null)
      .gte("created_at", todayStart.toISOString());
    const dailyTotal = (dailyClaims || []).reduce((sum: number, e: any) => sum + Number(e.reward_usd || 0), 0);
    if (dailyTotal >= DAILY_CEILING_USD) {
      return json({ skipped: true, reason: "daily_ceiling_reached", daily_total: dailyTotal });
    }

    // Find claimable fights
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

      const isPolymarket = !!(fight.polymarket_market_id && fight.polymarket_condition_id);

      // Get unclaimed winning entries
      const { data: entries, error: eErr } = await supabase
        .from("prediction_entries")
        .select("*")
        .eq("fight_id", fight.id)
        .eq("fighter_pick", fight.winner)
        .eq("claimed", false)
        .limit(BATCH_SIZE - totalProcessed);
      if (eErr || !entries || entries.length === 0) continue;

      // Group by wallet
      const walletEntries: Record<string, any[]> = {};
      for (const entry of entries) {
        if (!walletEntries[entry.wallet]) walletEntries[entry.wallet] = [];
        walletEntries[entry.wallet].push(entry);
      }

      for (const [wallet, wEntries] of Object.entries(walletEntries)) {
        if (totalProcessed >= BATCH_SIZE) break;

        const entryIds = wEntries.map((e: any) => e.id);

        if (isPolymarket) {
          // ── POLYMARKET PATH ──
          const { data: tradeOrders } = await supabase
            .from("prediction_trade_orders")
            .select("filled_shares, filled_amount_usdc, polymarket_order_id")
            .eq("fight_id", fight.id)
            .eq("wallet", wallet)
            .in("status", ["filled", "submitted"]);

          const hasRealPMOrder = (tradeOrders || []).some(
            (o: any) => o.polymarket_order_id != null && o.polymarket_order_id !== "",
          );

          let rewardUsd = 0;

          if (hasRealPMOrder) {
            const totalFilledShares = (tradeOrders || []).reduce(
              (s: number, o: any) => s + Number(o.filled_shares || 0), 0,
            );
            rewardUsd = Number(totalFilledShares.toFixed(6));
          } else {
            // Local-only: use filled_amount_usdc as reward (winner gets stake back)
            const userStake = (tradeOrders || []).reduce(
              (s: number, o: any) => s + Number(o.filled_amount_usdc || 0), 0,
            );
            const { data: allFightOrders } = await supabase
              .from("prediction_trade_orders")
              .select("filled_amount_usdc")
              .eq("fight_id", fight.id)
              .in("status", ["filled", "submitted"]);

            const localPool = (allFightOrders || []).reduce(
              (s: number, o: any) => s + Number(o.filled_amount_usdc || 0), 0,
            );
            const totalStake = localPool;
            rewardUsd = totalStake > 0
              ? Number(((userStake / totalStake) * localPool).toFixed(6))
              : userStake;
          }

          if (rewardUsd <= 0) {
            const entryShares = wEntries.reduce((s: number, e: any) => s + Number(e.shares || 0), 0);
            rewardUsd = entryShares / 100;
          }

          if (rewardUsd <= 0 || rewardUsd > MAX_CLAIM_USD) continue;
          if (dailyTotal + totalPaid + rewardUsd > DAILY_CEILING_USD) break;

          let payoutTxHash: string | undefined;

          if (hasRealPMOrder) {
            // Real PM: attempt CTF redemption
            const { data: pmSession } = await supabase
              .from("polymarket_user_sessions")
              .select("pm_trading_key, pm_derived_address")
              .eq("wallet", wallet)
              .maybeSingle();

            if (pmSession?.pm_trading_key) {
              try {
                const tradingKey = (pmSession.pm_trading_key.startsWith("0x")
                  ? pmSession.pm_trading_key
                  : `0x${pmSession.pm_trading_key}`) as `0x${string}`;
                const tradingAccount = privateKeyToAccount(tradingKey);

                await ensureGas(tradingAccount.address);
                await redeemCTF(tradingAccount, fight.polymarket_condition_id);
                const withdrawal = await withdrawFromDerived(tradingAccount, wallet);
                payoutTxHash = withdrawal.txHash;
              } catch (err: any) {
                console.warn(`[auto-claim] PM claim error for ${wallet}:`, err.message);
              }
            }
          }
          // Local-only trades: no CTF redemption needed, just mark as settled

          await supabase.from("prediction_entries")
            .update({
              claimed: true,
              reward_usd: rewardUsd,
              reward_lamports: 0,
              tx_signature: payoutTxHash || null,
              polymarket_status: hasRealPMOrder
                ? (payoutTxHash ? "redeemed" : "redemption_pending")
                : "local_settled",
            })
            .in("id", entryIds);

          await supabase.from("automation_logs").insert({
            action: hasRealPMOrder
              ? (payoutTxHash ? "auto_claim_pm_paid" : "auto_claim_pm_pending")
              : "auto_claim_local_settled",
            source: "prediction-auto-claim",
            fight_id: fight.id,
            details: { wallet, reward_usd: rewardUsd, payout_tx: payoutTxHash, has_real_pm_order: hasRealPMOrder, entries: entryIds.length },
          });

          totalProcessed += wEntries.length;
          totalPaid += rewardUsd;
        } else {
          // ── NATIVE PATH: parimutuel math + treasury transfer ──
          const totalWinningShares = fight.winner === "fighter_a"
            ? Number(fight.shares_a)
            : Number(fight.shares_b);
          const userShares = wEntries.reduce((sum: number, e: any) => sum + Number(e.shares), 0);
          const rewardUsd = calculateNativeReward(userShares, totalWinningShares, fight);

          if (rewardUsd <= 0 || rewardUsd > MAX_CLAIM_USD) continue;
          if (dailyTotal + totalPaid + rewardUsd > DAILY_CEILING_USD) break;

          const payoutResult = await transferUsdcFromTreasury(wallet, rewardUsd);

          if (!payoutResult.success) {
            errors.push({ wallet, fight_id: fight.id, error: payoutResult.error || "unknown" });
            await supabase.from("automation_logs").insert({
              action: "auto_claim_payout_failed",
              source: "prediction-auto-claim",
              fight_id: fight.id,
              details: { wallet, reward_usd: rewardUsd, error: payoutResult.error, entries: entryIds.length },
            });
            continue;
          }

          await supabase.from("prediction_entries")
            .update({ claimed: true, reward_usd: rewardUsd, reward_lamports: 0, tx_signature: payoutResult.txHash })
            .in("id", entryIds);

          await supabase.from("automation_logs").insert({
            action: "auto_claim_paid",
            source: "prediction-auto-claim",
            fight_id: fight.id,
            details: { wallet, reward_usd: rewardUsd, tx_hash: payoutResult.txHash, entries: entryIds.length },
          });

          totalProcessed += wEntries.length;
          totalPaid += rewardUsd;
        }
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
