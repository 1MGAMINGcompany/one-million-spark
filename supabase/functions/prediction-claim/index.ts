import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi } from "viem";
import { polygon } from "viem/chains";

/**
 * prediction-claim — Source-aware claim/redemption.
 *
 * Polymarket events: CTF contract redemption via user's derived trading key,
 *   then USDC transfer from derived EOA → user's Privy wallet.
 * Native events: USDC transfer from treasury to winner's wallet.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CLAIM_USD = 500;
const DAILY_CEILING_USD = 5_000;

// Bridged USDC.e — canonical token for all prediction money flows
const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_DECIMALS = 6;
const RPC_PROVIDERS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon.llamarpc.com",
  "https://polygon-rpc.com",
];

// Polymarket Conditional Tokens Framework contract
const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const ctfAbi = parseAbi([
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
]);

/** Try an async operation across multiple RPC endpoints */
async function callWithFallback<T>(fn: (rpc: string) => Promise<T>): Promise<T> {
  for (const rpc of RPC_PROVIDERS) {
    try { return await fn(rpc); }
    catch (e: any) { console.warn(`[prediction-claim] RPC ${rpc} failed:`, e.message); }
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

// ── Native event reward (parimutuel math) ──
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

// ── Ensure derived EOA has enough MATIC for gas ──
async function ensureGas(targetAddress: string): Promise<void> {
  const MIN_MATIC = 5_000_000_000_000_000n; // 0.005 MATIC
  const GAS_AMOUNT = 10_000_000_000_000_000n; // 0.01 MATIC

  const balJson = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getBalance",
        params: [targetAddress, "latest"],
      }),
    });
    const j = await res.json();
    if (!j.result) throw new Error("Failed to get MATIC balance");
    return j;
  });

  if (BigInt(balJson.result) >= MIN_MATIC) return;

  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  if (!relayerKey) throw new Error("No relayer key for gas funding");

  const relayerAccount = privateKeyToAccount(
    (relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`) as `0x${string}`,
  );

  const nonceJson = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getTransactionCount",
        params: [relayerAccount.address, "latest"],
      }),
    });
    return await res.json();
  });

  const walletClient = createWalletClient({
    account: relayerAccount,
    chain: polygon,
    transport: http(RPC_PROVIDERS[0]),
  });

  await walletClient.sendTransaction({
    to: targetAddress as `0x${string}`,
    value: GAS_AMOUNT,
    gas: 21_000n,
    nonce: Number(BigInt(nonceJson.result)),
  });

  console.log(`[prediction-claim] Funded gas: 0.01 MATIC → ${targetAddress}`);
}

// ── CTF redemption: redeem winning conditional tokens → USDC ──
async function redeemCTFPositions(
  account: ReturnType<typeof privateKeyToAccount>,
  conditionId: string,
): Promise<string> {
  const condBytes32 = (
    conditionId.startsWith("0x") ? conditionId : `0x${conditionId}`
  ) as `0x${string}`;

  const txData = encodeFunctionData({
    abi: ctfAbi,
    functionName: "redeemPositions",
    args: [
      USDC_CONTRACT as `0x${string}`,
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      condBytes32,
      [1n, 2n], // both outcomes for binary market
    ],
  });

  const gasPriceJson = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
    });
    return await res.json();
  });

  const nonceJson = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getTransactionCount",
        params: [account.address, "latest"],
      }),
    });
    return await res.json();
  });

  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(RPC_PROVIDERS[0]),
  });

  const txHash = await walletClient.sendTransaction({
    to: CTF_CONTRACT as `0x${string}`,
    data: txData,
    gas: 200_000n,
    gasPrice: BigInt(gasPriceJson.result) * 12n / 10n,
    nonce: Number(BigInt(nonceJson.result)),
    value: 0n,
  });

  console.log(`[prediction-claim] CTF redeemPositions tx: ${txHash}`);
  return txHash;
}

// ── Transfer USDC from derived EOA to user's Privy wallet ──
async function transferFromDerived(
  tradingAccount: ReturnType<typeof privateKeyToAccount>,
  recipientWallet: string,
): Promise<{ success: boolean; txHash?: string; amountUsdc?: number; error?: string }> {
  // Read USDC balance of derived EOA
  const balCallData = "0x70a08231" + padAddress(tradingAccount.address);
  const balResult = await callWithFallback(async (rpc) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{ to: USDC_CONTRACT, data: balCallData }, "latest"],
      }),
    });
    return await res.json();
  });

  const balance = BigInt(balResult?.result || "0");
  if (balance <= 0n) {
    return { success: false, error: "no_usdc_in_derived_eoa", amountUsdc: 0 };
  }

  const txData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipientWallet as `0x${string}`, balance],
  });

  const [gasPriceJson, nonceJson] = await Promise.all([
    callWithFallback(async (rpc) => {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
      });
      return await res.json();
    }),
    callWithFallback(async (rpc) => {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_getTransactionCount",
          params: [tradingAccount.address, "latest"],
        }),
      });
      return await res.json();
    }),
  ]);

  const walletClient = createWalletClient({
    account: tradingAccount,
    chain: polygon,
    transport: http(RPC_PROVIDERS[0]),
  });

  const txHash = await walletClient.sendTransaction({
    to: USDC_CONTRACT as `0x${string}`,
    data: txData,
    gas: 100_000n,
    gasPrice: BigInt(gasPriceJson.result) * 12n / 10n,
    nonce: Number(BigInt(nonceJson.result)),
    value: 0n,
  });

  const amountUsdc = Number(balance) / 10 ** USDC_DECIMALS;
  console.log(`[prediction-claim] USDC transfer: ${amountUsdc} from ${tradingAccount.address} → ${recipientWallet}, tx=${txHash}`);
  return { success: true, txHash, amountUsdc };
}

// ── Native (custom) event payout: send winnings from TREASURY wallet ──
// Treasury holds all native-event stakes (deposited via prediction-submit) and
// pays winners directly. Falls back to FEE_RELAYER_PRIVATE_KEY for backwards
// compatibility with old events whose pool was never moved to Treasury.
async function transferUsdcFromTreasury(
  recipientWallet: string,
  amountUsd: number,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const treasuryKey = Deno.env.get("TREASURY_PRIVATE_KEY");
  const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
  const payerKey = treasuryKey || relayerKey;
  const payerLabel = treasuryKey ? "treasury" : "relayer_fallback";
  if (!payerKey) return { success: false, error: "no_payer_key_configured" };

  try {
    const account = privateKeyToAccount(
      (payerKey.startsWith("0x") ? payerKey : `0x${payerKey}`) as `0x${string}`,
    );
    const amountRaw = BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));

    // Check payer USDC balance
    const balData = "0x70a08231" + padAddress(account.address);
    const balJson = await callWithFallback(async (rpc) => {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_call",
          params: [{ to: USDC_CONTRACT, data: balData }, "latest"],
        }),
      });
      return await res.json();
    });
    if (balJson.result && BigInt(balJson.result) < amountRaw) {
      return { success: false, error: `insufficient_${payerLabel}_balance` };
    }

    const txData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipientWallet as `0x${string}`, amountRaw],
    });

    const [nonceJson, gasPriceJson] = await Promise.all([
      callWithFallback(async (rpc) => {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "eth_getTransactionCount",
            params: [account.address, "latest"],
          }),
        });
        return await res.json();
      }),
      callWithFallback(async (rpc) => {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
        });
        return await res.json();
      }),
    ]);

    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(RPC_PROVIDERS[0]),
    });

    const txHash = await walletClient.sendTransaction({
      to: USDC_CONTRACT as `0x${string}`,
      data: txData,
      gas: 100_000n,
      gasPrice: BigInt(gasPriceJson.result) * 12n / 10n,
      nonce: Number(BigInt(nonceJson.result)),
      value: 0n,
    });

    console.log(`[prediction-claim] Native payout from ${payerLabel}: $${amountUsd} → ${recipientWallet}, tx=${txHash}`);
    return { success: true, txHash };
  } catch (err) {
    console.error("[prediction-claim] Treasury payout failed:", err);
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

    const entryIds = entries.map((e: any) => e.id);
    const isPolymarketBacked = !!(fight.polymarket_market_id && fight.polymarket_condition_id);

    // ══════════════════════════════════════════════════
    // POLYMARKET CLAIM PATH — CTF redemption + withdrawal
    // ══════════════════════════════════════════════════
    if (isPolymarketBacked) {
      const walletLower = String(wallet).trim().toLowerCase();

      // 1. Get trade orders for accurate reward calculation
      const { data: tradeOrders } = await supabase
        .from("prediction_trade_orders")
        .select("filled_shares, filled_amount_usdc, avg_fill_price, polymarket_order_id")
        .eq("fight_id", fight_id)
        .eq("wallet", walletLower)
        .in("status", ["filled", "submitted"]);

      // Check if any trade was actually placed on Polymarket CLOB
      const hasRealPMOrder = (tradeOrders || []).some(
        (o: any) => o.polymarket_order_id != null && o.polymarket_order_id !== "",
      );

      let pmRewardUsd = 0;

      if (!hasRealPMOrder) {
        // No real Polymarket order was placed — there are no on-chain tokens to redeem.
        // Mark entries as not_executed so the UI shows the correct state.
        await supabase.from("prediction_entries")
          .update({
            polymarket_status: "not_executed",
          })
          .in("id", entryIds);

        await supabase.from("automation_logs").insert({
          action: "claim_rejected_no_pm_order",
          source: "prediction-claim",
          fight_id,
          details: {
            wallet: walletLower,
            entries: entryIds.length,
            note: "No polymarket_order_id — trade was never executed on Polymarket CLOB",
          },
        });

        return json({
          error: "This prediction was never executed on Polymarket. No position exists to claim.",
          error_code: "no_pm_order",
          entries: entryIds.length,
        }, 400);
      }

      // Real Polymarket trades: each winning share resolves to exactly $1.00
      const totalFilledShares = (tradeOrders || []).reduce(
        (s: number, o: any) => s + Number(o.filled_shares || 0), 0,
      );
      pmRewardUsd = Number(totalFilledShares.toFixed(6));

      if (pmRewardUsd <= 0) {
        return json({ error: "No winning shares found in trade orders" }, 400);
      }

      if (pmRewardUsd > MAX_CLAIM_USD) {
        return json({ error: "Claim exceeds safety limit — contact support", max_usd: MAX_CLAIM_USD, reward_usd: pmRewardUsd }, 400);
      }

      // 3. Real PM order path: Get PM session for derived wallet credentials
      const { data: pmSession } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, pm_trading_key, pm_derived_address, safe_address")
        .eq("wallet", walletLower)
        .maybeSingle();

      if (!pmSession?.pm_trading_key) {
        await supabase.from("prediction_entries")
          .update({ claimed: true, reward_usd: pmRewardUsd, reward_lamports: 0, polymarket_status: "redemption_pending" })
          .in("id", entryIds);

        return json({
          success: true,
          reward_usd: pmRewardUsd,
          entries_claimed: entryIds.length,
          payout_method: "polymarket_redemption_pending",
          source: "polymarket",
          message: "Reward recorded. Payout pending — complete trading wallet setup.",
        });
      }

      // 4. Attempt CTF redemption + USDC withdrawal
      const tradingKey = (pmSession.pm_trading_key.startsWith("0x")
        ? pmSession.pm_trading_key
        : `0x${pmSession.pm_trading_key}`) as `0x${string}`;
      const tradingAccount = privateKeyToAccount(tradingKey);

      let payoutTxHash: string | undefined;
      let redeemTxHash: string | undefined;
      let payoutAmount = 0;

      try {
        await ensureGas(tradingAccount.address);
        try {
          redeemTxHash = await redeemCTFPositions(tradingAccount, fight.polymarket_condition_id);
        } catch (redeemErr: any) {
          console.warn(`[prediction-claim] CTF redemption note: ${redeemErr.message}`);
        }
        const transferResult = await transferFromDerived(tradingAccount, walletLower);
        if (transferResult.success) {
          payoutTxHash = transferResult.txHash;
          payoutAmount = transferResult.amountUsdc || 0;
        }
      } catch (err: any) {
        console.error("[prediction-claim] Polymarket claim error:", err);
      }

      // 5. Mark entries as claimed with correct reward
      await supabase.from("prediction_entries")
        .update({
          claimed: true,
          reward_usd: pmRewardUsd,
          reward_lamports: 0,
          tx_signature: payoutTxHash || redeemTxHash || null,
          polymarket_status: payoutTxHash ? "redeemed" : "redemption_pending",
        })
        .in("id", entryIds);

      if (payoutTxHash) {
        await supabase
          .from("polymarket_user_positions")
          .update({
            realized_pnl: pmRewardUsd,
            pm_order_status: "redeemed",
            synced_at: new Date().toISOString(),
          })
          .eq("wallet", walletLower)
          .eq("fight_id", fight_id);
      }

      await supabase.from("automation_logs").insert({
        action: payoutTxHash ? "polymarket_claim_paid" : "polymarket_claim_pending",
        source: "prediction-claim",
        fight_id,
        details: {
          wallet: walletLower,
          reward_usd: pmRewardUsd,
          payout_amount_usdc: payoutAmount,
          redeem_tx: redeemTxHash,
          payout_tx: payoutTxHash,
          condition_id: fight.polymarket_condition_id,
          entries: entryIds.length,
        },
      });

      return json({
        success: true,
        reward_usd: pmRewardUsd,
        entries_claimed: entryIds.length,
        payout_method: payoutTxHash ? "polymarket_ctf_redemption" : "polymarket_redemption_pending",
        payout_tx: payoutTxHash,
        source: "polymarket",
        ...(payoutTxHash ? {} : { message: "Reward recorded. USDC withdrawal will be retried automatically." }),
      });
    }

    // ══════════════════════════════════════════════════
    // NATIVE 1MGAMING CLAIM PATH — parimutuel pool math + treasury transfer
    // ══════════════════════════════════════════════════
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

    // Daily ceiling check
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

    if (dailyTotal + rewardUsd > DAILY_CEILING_USD) {
      return json({
        error: "Daily payout ceiling reached. Please try again tomorrow.",
        daily_limit_usd: DAILY_CEILING_USD,
      }, 429);
    }

    const payoutResult = await transferUsdcFromTreasury(wallet, rewardUsd);

    if (!payoutResult.success) {
      await supabase.from("automation_logs").insert({
        action: "native_claim_payout_failed",
        source: "prediction-claim",
        fight_id,
        details: { wallet, reward_usd: rewardUsd, error: payoutResult.error, entries: entryIds.length },
      });
      return json({ error: "Payout transfer failed. Please try again shortly.", detail: payoutResult.error }, 502);
    }

    await supabase.from("prediction_entries")
      .update({ claimed: true, reward_usd: rewardUsd, reward_lamports: 0, tx_signature: payoutResult.txHash })
      .in("id", entryIds);

    await supabase.from("automation_logs").insert({
      action: "native_claim_paid",
      source: "prediction-claim",
      fight_id,
      details: { wallet, reward_usd: rewardUsd, tx_hash: payoutResult.txHash, entries: entryIds.length },
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
