import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "npm:viem@2/accounts";
import { createWalletClient, http, encodeFunctionData, parseAbi } from "npm:viem@2";
import { polygon } from "npm:viem@2/chains";

/**
 * prediction-confirm — Receives client-side CLOB order results.
 *
 * After the browser signs and submits an order to Polymarket CLOB,
 * it calls this function to report the result back for reconciliation.
 *
 * Responsibilities:
 * - Validate Privy JWT + trade_order ownership
 * - Update prediction_trade_orders with order ID or failure
 * - Insert prediction_entries
 * - Update fight pool totals
 * - Log operator revenue
 * - Sweep operator fee share from treasury to operator wallet (if payout_wallet set)
 */

// ── Polygon constants ──
const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_DECIMALS = 6;
const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
  "https://polygon.llamarpc.com",
];

const erc20TransferAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

/** Try a JSON-RPC call across multiple endpoints */
async function polygonRpcCall(
  body: Record<string, unknown>,
): Promise<{ result?: string; error?: string; rpc?: string }> {
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { await res.text().catch(() => {}); continue; }
      const json = await res.json();
      if (json.error) continue;
      if (json.result != null) return { result: json.result, rpc };
    } catch { continue; }
  }
  return { error: "all_rpcs_failed" };
}

/**
 * Sweep operator fee from treasury to operator's payout wallet.
 * Idempotent: only processes revenue rows with sweep_status = 'accrued'.
 * On failure, marks as 'failed' with error — funds remain in treasury.
 */
async function sweepOperatorFee(
  supabase: SupabaseClient<any>,
  revenueId: string,
  operatorFeeUsdc: number,
  payoutWallet: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const MIN_SWEEP_USD = 0.01;
  if (operatorFeeUsdc < MIN_SWEEP_USD) {
    console.log(`[prediction-confirm] Sweep skipped: fee $${operatorFeeUsdc} below minimum`);
    return { success: false, error: "below_minimum" };
  }

  // CAS: only sweep if still 'accrued' (prevents double-send)
  const { data: claimed, error: casErr } = await supabase
    .from("operator_revenue")
    .update({
      sweep_status: "sending",
      sweep_attempted_at: new Date().toISOString(),
      sweep_destination_wallet: payoutWallet,
    })
    .eq("id", revenueId)
    .eq("sweep_status", "accrued")
    .select("id")
    .single();

  if (casErr || !claimed) {
    console.log(`[prediction-confirm] Sweep CAS failed for revenue ${revenueId} — already processing`);
    return { success: false, error: "cas_failed_already_processing" };
  }

  // Polymarket fees are collected by the Relayer (gas-only) into the Treasury
  // wallet via transferFrom. The funds live in Treasury, so commission sweeps
  // must be SIGNED by Treasury — not the Relayer (which holds no USDC.e).
  const treasuryKey = Deno.env.get("TREASURY_PRIVATE_KEY");
  if (!treasuryKey) {
    await supabase.from("operator_revenue").update({
      sweep_status: "failed",
      sweep_error: "treasury_not_configured",
    }).eq("id", revenueId);
    return { success: false, error: "treasury_not_configured" };
  }

  try {
    const account = privateKeyToAccount(
      (treasuryKey.startsWith("0x") ? treasuryKey : `0x${treasuryKey}`) as `0x${string}`,
    );
    const amountRaw = BigInt(Math.floor(operatorFeeUsdc * 10 ** USDC_DECIMALS));

    const txData = encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [payoutWallet as `0x${string}`, amountRaw],
    });

    // Get nonce and gas price
    const [nonceRpc, gasPriceRpc] = await Promise.all([
      polygonRpcCall({
        jsonrpc: "2.0", id: 1,
        method: "eth_getTransactionCount",
        params: [account.address, "pending"],
      }),
      polygonRpcCall({
        jsonrpc: "2.0", id: 2,
        method: "eth_gasPrice",
        params: [],
      }),
    ]);

    if (nonceRpc.error || !nonceRpc.result || gasPriceRpc.error || !gasPriceRpc.result) {
      const err = "rpc_unavailable";
      await supabase.from("operator_revenue").update({
        sweep_status: "failed",
        sweep_error: err,
      }).eq("id", revenueId);
      return { success: false, error: err };
    }

    const workingRpc = gasPriceRpc.rpc || POLYGON_RPCS[0];
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(workingRpc),
    });

    const txHash = await walletClient.sendTransaction({
      to: USDC_CONTRACT as `0x${string}`,
      data: txData as `0x${string}`,
      gas: 100_000n,
      gasPrice: BigInt(gasPriceRpc.result) * 12n / 10n,
      nonce: Number(BigInt(nonceRpc.result)),
      value: 0n,
    });

    // Success: mark as sent
    await supabase.from("operator_revenue").update({
      sweep_status: "sent",
      sweep_tx_hash: txHash,
      sweep_completed_at: new Date().toISOString(),
      sweep_error: null,
    }).eq("id", revenueId);

    console.log(`[prediction-confirm] Operator sweep SUCCESS: $${operatorFeeUsdc} → ${payoutWallet}, tx=${txHash}`);
    return { success: true, txHash };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[prediction-confirm] Operator sweep FAILED: $${operatorFeeUsdc} → ${payoutWallet}:`, errorMsg);

    await supabase.from("operator_revenue").update({
      sweep_status: "failed",
      sweep_error: errorMsg.substring(0, 500),
    }).eq("id", revenueId);

    return { success: false, error: errorMsg };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-privy-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  const supabase: SupabaseClient<any> = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Privy JWT verification ──
  let privyDid: string | null = null;
  {
    const privyToken = req.headers.get("x-privy-token");
    const appId = Deno.env.get("VITE_PRIVY_APP_ID");

    if (!privyToken || privyToken.length < 20 || !appId) {
      return json({ error: "Authentication required", error_code: "auth_required" }, 401);
    }

    try {
      const parts = privyToken.split(".");
      if (parts.length !== 3) throw new Error("malformed_jwt");

      const headerB64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
      const header = JSON.parse(atob(headerB64));

      const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jwtPayload = JSON.parse(atob(payloadB64));

      const now = Math.floor(Date.now() / 1000);
      if (jwtPayload.exp && jwtPayload.exp < now) throw new Error("token_expired");
      if (jwtPayload.iss !== "privy.io") throw new Error("invalid_issuer");
      if (jwtPayload.aud !== appId) throw new Error("invalid_audience");

      const jwksUrl = `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`;
      const jwksRes = await fetch(jwksUrl);
      if (!jwksRes.ok) throw new Error("jwks_fetch_failed");
      const { keys } = await jwksRes.json();

      const matchingKey = keys.find((k: any) => k.kid === header.kid);
      if (!matchingKey) throw new Error("unknown_signing_key");

      const alg = matchingKey.kty === "EC"
        ? { name: "ECDSA", namedCurve: matchingKey.crv || "P-256" }
        : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      const verifyAlg = matchingKey.kty === "EC"
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5" };

      const cryptoKey = await crypto.subtle.importKey(
        "jwk", matchingKey, alg, false, ["verify"],
      );

      const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const sigB64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
      const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));

      const valid = await crypto.subtle.verify(verifyAlg, cryptoKey, sig, data);
      if (!valid) throw new Error("invalid_jwt_signature");

      privyDid = (jwtPayload.sub as string) || null;
      if (!privyDid) throw new Error("no_did_in_token");
    } catch (e) {
      return json({ error: "Authentication failed", error_code: "auth_failed" }, 401);
    }
  }

  try {
    const body = await req.json();
    const {
      trade_order_id,
      polymarket_order_id,
      status: clientStatus,
      error_code: clientErrorCode,
      error_message: clientErrorMessage,
      failure_class: clientFailureClass,
      diagnostics: clientDiagnostics,
    } = body;

    if (!trade_order_id) {
      return json({ error: "Missing trade_order_id" }, 400);
    }

    // ── Resolve wallet from Privy DID ──
    let wallet: string | null = null;
    {
      const { data: account } = await supabase
        .from("prediction_accounts")
        .select("wallet_evm")
        .eq("privy_did", privyDid)
        .maybeSingle();
      wallet = account?.wallet_evm?.toLowerCase() ?? null;
    }

    if (!wallet) {
      return json({ error: "Account not found", error_code: "account_not_found" }, 404);
    }

    // ── Load and verify trade order ownership ──
    const { data: tradeOrder, error: tradeErr } = await supabase
      .from("prediction_trade_orders")
      .select("*")
      .eq("id", trade_order_id)
      .single();

    if (tradeErr || !tradeOrder) {
      return json({ error: "Trade order not found", error_code: "order_not_found" }, 404);
    }

    if (tradeOrder.wallet.toLowerCase() !== wallet) {
      return json({ error: "Trade order does not belong to this wallet", error_code: "unauthorized" }, 403);
    }

    // Only process orders in "pending_client_submit" status
    if (tradeOrder.status !== "pending_client_submit") {
      return json({ error: "Trade order already processed", error_code: "already_processed", trade_status: tradeOrder.status }, 400);
    }

    // ── Load fight data ──
    const { data: fight } = await supabase
      .from("prediction_fights")
      .select("*")
      .eq("id", tradeOrder.fight_id)
      .single();

    if (!fight) {
      return json({ error: "Fight not found" }, 404);
    }

    const isSuccess = clientStatus === "submitted" && !!polymarket_order_id;

    if (isSuccess) {
      // ── Success path: order was placed on CLOB ──
      await supabase
        .from("prediction_trade_orders")
        .update({
          status: "submitted",
          polymarket_order_id,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", trade_order_id);

      // Insert prediction entry
      const { data: entry } = await supabase
        .from("prediction_entries")
        .insert({
          fight_id: tradeOrder.fight_id,
          wallet,
          fighter_pick: tradeOrder.side,
          amount_usd: tradeOrder.requested_amount_usdc,
          fee_usd: tradeOrder.fee_usdc,
          pool_usd: tradeOrder.requested_amount_usdc - tradeOrder.fee_usdc,
          shares: tradeOrder.expected_shares || Math.floor((tradeOrder.requested_amount_usdc - tradeOrder.fee_usdc) * 100),
          polymarket_order_id,
          polymarket_status: "submitted",
          amount_lamports: 0,
          fee_lamports: 0,
          pool_lamports: 0,
          source_operator_id: tradeOrder.source_operator_id || fight.operator_id || null,
        })
        .select()
        .single();

      // Update fight pool totals
      const netAmountUsdc = tradeOrder.requested_amount_usdc - tradeOrder.fee_usdc;
      const shares = tradeOrder.expected_shares || Math.floor(netAmountUsdc * 100);
      const side = tradeOrder.side;

      const { error: rpcErr } = await supabase.rpc("prediction_update_pool_usd", {
        p_fight_id: tradeOrder.fight_id,
        p_pool_usd: netAmountUsdc,
        p_shares: shares,
        p_side: side,
      });

      if (rpcErr) {
        // Fallback: direct update
        const poolCol = side === "fighter_a" ? "pool_a_usd" : "pool_b_usd";
        const sharesCol = side === "fighter_a" ? "shares_a" : "shares_b";
        const newPoolVal = (side === "fighter_a" ? fight.pool_a_usd : fight.pool_b_usd) + netAmountUsdc;
        const newSharesVal = (side === "fighter_a" ? fight.shares_a : fight.shares_b) + shares;
        await supabase
          .from("prediction_fights")
          .update({ [poolCol]: newPoolVal, [sharesCol]: newSharesVal })
          .eq("id", tradeOrder.fight_id);
      }

      // Operator revenue tracking
      const resolvedOperatorId = tradeOrder.source_operator_id || fight.operator_id || null;
      if (resolvedOperatorId && entry) {
        try {
          const platformFeeBps = 150;
          const platformFeeUsd = Number(((tradeOrder.requested_amount_usdc * platformFeeBps) / 10_000).toFixed(6));
          const operatorFeeUsd = Math.max(0, Number((tradeOrder.fee_usdc - platformFeeUsd).toFixed(6)));
          const { data: revRow } = await supabase.from("operator_revenue").insert({
            operator_id: resolvedOperatorId,
            fight_id: tradeOrder.fight_id,
            entry_id: entry.id,
            trade_order_id,
            platform_fee_usdc: platformFeeUsd,
            operator_fee_usdc: operatorFeeUsd,
            total_fee_usdc: tradeOrder.fee_usdc,
            entry_amount_usdc: tradeOrder.requested_amount_usdc,
          }).select("id").single();

          // ── Sweep operator fee to operator wallet (non-blocking) ──
          if (revRow && operatorFeeUsd > 0) {
            try {
              const { data: op } = await supabase
                .from("operators")
                .select("payout_wallet")
                .eq("id", resolvedOperatorId)
                .single();

              if (op?.payout_wallet) {
                const sweepResult = await sweepOperatorFee(
                  supabase, revRow.id, operatorFeeUsd, op.payout_wallet,
                );
                if (sweepResult.success) {
                  console.log(`[prediction-confirm] Operator sweep completed: tx=${sweepResult.txHash}`);
                } else {
                  console.warn(`[prediction-confirm] Operator sweep deferred: ${sweepResult.error}`);
                }
              } else {
                console.log(`[prediction-confirm] No payout_wallet for operator ${resolvedOperatorId} — sweep skipped`);
              }
            } catch (sweepErr) {
              console.warn("[prediction-confirm] Operator sweep error (non-fatal):", sweepErr);
            }
          }
        } catch (revErr) {
          console.warn("[prediction-confirm] operator_revenue insert failed:", revErr);
        }
      }

      // Audit log
      try {
        await supabase.from("prediction_trade_audit_log").insert({
          trade_order_id,
          wallet,
          action: "client_order_confirmed",
          response_payload_json: {
            polymarket_order_id,
            entry_id: entry?.id,
          },
        });
      } catch {}

      return json({
        success: true,
        trade_order_id,
        trade_status: "submitted",
        polymarket_order_id,
        entry_id: entry?.id,
        requested_amount_usdc: tradeOrder.requested_amount_usdc,
        fee_usdc: tradeOrder.fee_usdc,
        net_amount_usdc: netAmountUsdc,
        fee_bps: tradeOrder.fee_bps,
      });
    } else {
      // ── Failure path: CLOB rejected the order ──
      const errorCode = clientErrorCode || "client_submit_failed";
      const errorMsg = clientErrorMessage || "Order was not placed on the exchange";

      await supabase
        .from("prediction_trade_orders")
        .update({
          status: "failed",
          error_code: errorCode,
          error_message: errorMsg.substring(0, 500),
          finalized_at: new Date().toISOString(),
        })
        .eq("id", trade_order_id);

      // Audit log
      try {
        await supabase.from("prediction_trade_audit_log").insert({
          trade_order_id,
          wallet,
          action: "client_order_failed",
          response_payload_json: {
            error_code: errorCode,
            error_message: errorMsg.substring(0, 200),
            failure_class: clientFailureClass || null,
            diagnostics: clientDiagnostics || null,
          },
        });
      } catch {}

      return json({
        success: false,
        trade_order_id,
        trade_status: "failed",
        error: errorMsg,
        error_code: errorCode,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[prediction-confirm] Error:", errorMsg);
    return json({ error: errorMsg }, 500);
  }
});
