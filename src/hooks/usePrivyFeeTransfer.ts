/**
 * usePrivyFeeTransfer — One-time ERC-20 approve for fee relayer.
 *
 * Instead of transferring USDC per prediction (which triggers a modal each time),
 * this hook manages a one-time `approve(relayer, cap)` call. After approval,
 * the backend relayer executes `transferFrom` without any client wallet interaction.
 *
 * Uses Privy's `useSendTransaction` with `sponsor: true` so the user's smart
 * wallet doesn't need native MATIC — gas is paid by the dashboard-configured
 * gas sponsorship policy.
 *
 * USDC on Polygon: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 (6 decimals)
 * Relayer/Spender: 0x3b3bf64329CCf08a727e4fEd41821E8534685fAD (derived from FEE_RELAYER_PRIVATE_KEY)
 * Treasury/Destination: 0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d (receives fees via transferFrom)
 */
import { useCallback } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, parseAbi } from "viem";
import { FEE_RELAYER_ADDRESS } from "./usePolygonUSDC";

const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
const USDC_DECIMALS = 6;

/** Approval cap: 100 USDC — enough for ~100+ predictions before re-approval */
const APPROVAL_CAP_USDC = 100;
const APPROVAL_CAP_RAW = BigInt(APPROVAL_CAP_USDC * 10 ** USDC_DECIMALS);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

/** Poll Polygon RPCs for a transaction receipt until mined or timeout */
async function waitForReceipt(
  txHash: string,
  maxAttempts = 8,
  intervalMs = 2000,
): Promise<{ status: string | null; found: boolean }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, intervalMs));
    for (const rpc of POLYGON_RPCS) {
      try {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [txHash],
          }),
        });
        if (!res.ok) continue;
        const json = await res.json();
        if (json.result) {
          return { status: json.result.status, found: true };
        }
        // result is null → not mined yet, try next attempt
        break;
      } catch {
        continue;
      }
    }
  }
  return { status: null, found: false };
}

interface ApproveResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export function usePrivyFeeTransfer() {
  const { sendTransaction } = useSendTransaction();

  /**
   * Request a one-time ERC-20 approve for the fee relayer.
   * Only call this when allowance is insufficient.
   * Waits for on-chain confirmation before returning success.
   */
  const approveFeeAllowance = useCallback(
    async (): Promise<ApproveResult> => {
      try {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [FEE_RELAYER_ADDRESS, APPROVAL_CAP_RAW],
        });

        console.log(
          `[usePrivyFeeTransfer] Requesting sponsored USDC approval for $${APPROVAL_CAP_USDC} to relayer ${FEE_RELAYER_ADDRESS}`,
        );

        const receipt = await sendTransaction(
          {
            to: USDC_CONTRACT,
            data,
            value: 0,
            chainId: 137,
          },
          {
            sponsor: true,
          },
        );

        const txHash =
          typeof receipt === "string"
            ? receipt
            : (receipt as any)?.transactionHash ??
              (receipt as any)?.hash ??
              "";

        if (!txHash) {
          return { success: false, error: "no_tx_hash_returned" };
        }

        console.log("[usePrivyFeeTransfer] Got tx hash, waiting for on-chain confirmation:", txHash);

        // Poll for receipt to confirm the tx was mined and succeeded
        const onChainReceipt = await waitForReceipt(txHash);

        if (!onChainReceipt.found) {
          console.warn("[usePrivyFeeTransfer] Receipt not found after polling — tx may still be pending");
          return { success: false, error: "tx_not_confirmed_after_16s" };
        }

        if (onChainReceipt.status !== "0x1") {
          console.error("[usePrivyFeeTransfer] Approval tx reverted on-chain, status:", onChainReceipt.status);
          return { success: false, error: "approval_tx_reverted" };
        }

        console.log("[usePrivyFeeTransfer] Approval confirmed on-chain ✓", txHash);
        return { success: true, txHash };
      } catch (err: any) {
        console.error("[usePrivyFeeTransfer] Approval failed:", err);
        return {
          success: false,
          error: err?.message || "approval_failed",
        };
      }
    },
    [sendTransaction],
  );

  return { approveFeeAllowance, approvalCapUsdc: APPROVAL_CAP_USDC };
}
