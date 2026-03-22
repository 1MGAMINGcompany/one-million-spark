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
 * Relayer/Treasury: 0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d
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
   * Returns the approval tx hash on success.
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

        console.log("[usePrivyFeeTransfer] Sponsored approval tx hash:", txHash);
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
