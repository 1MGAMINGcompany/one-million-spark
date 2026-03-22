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
import { usePrivyWallet } from "./usePrivyWallet";

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

const ALLOWANCE_SELECTOR = "0xdd62ed3e"; // allowance(owner, spender)

function padAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

/**
 * Poll on-chain allowance until it's >= 1 USDC or timeout.
 * This works regardless of whether the tx hash is a UserOp hash or real tx hash.
 */
async function waitForAllowance(
  ownerAddress: string,
  maxAttempts = 10,
  intervalMs = 2000,
): Promise<{ allowance: number; confirmed: boolean }> {
  const callData =
    ALLOWANCE_SELECTOR +
    padAddress(ownerAddress) +
    padAddress(FEE_RELAYER_ADDRESS);

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
            method: "eth_call",
            params: [{ to: USDC_CONTRACT, data: callData }, "latest"],
          }),
        });
        if (!res.ok) continue;
        const json = await res.json();
        if (json.result) {
          const raw = Number(BigInt(json.result)) / 10 ** USDC_DECIMALS;
          console.log(`[waitForAllowance] attempt ${attempt + 1}: allowance = ${raw} USDC (owner=${ownerAddress})`);
          if (raw >= 1) {
            return { allowance: raw, confirmed: true };
          }
          // Got a response but allowance still 0 — break to next attempt
          break;
        }
      } catch {
        continue;
      }
    }
  }
  return { allowance: 0, confirmed: false };
}

interface ApproveResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export function usePrivyFeeTransfer() {
  const { sendTransaction } = useSendTransaction();
  const { walletAddress } = usePrivyWallet();

  /**
   * Request a one-time ERC-20 approve for the fee relayer.
   * Only call this when allowance is insufficient.
   * Confirms by polling on-chain allowance (not tx receipt — UserOp hashes don't resolve).
   */
  const approveFeeAllowance = useCallback(
    async (): Promise<ApproveResult> => {
      if (!walletAddress) {
        return { success: false, error: "no_wallet_address" };
      }

      try {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [FEE_RELAYER_ADDRESS, APPROVAL_CAP_RAW],
        });

        console.log(
          `[usePrivyFeeTransfer] Requesting sponsored USDC approval for $${APPROVAL_CAP_USDC} to relayer ${FEE_RELAYER_ADDRESS}`,
          `| owner wallet: ${walletAddress}`,
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

        console.log("[usePrivyFeeTransfer] sendTransaction returned:", txHash || "(empty)", typeof receipt === "object" ? JSON.stringify(receipt).slice(0, 200) : "");

        // Instead of polling for a tx receipt (which fails for UserOp hashes),
        // poll the on-chain allowance directly.
        console.log("[usePrivyFeeTransfer] Polling on-chain allowance for confirmation...");
        const result = await waitForAllowance(walletAddress);

        if (!result.confirmed) {
          console.error("[usePrivyFeeTransfer] Allowance not detected after polling. May be an EOA/smart-wallet address mismatch.");
          return { success: false, error: "allowance_not_confirmed_after_20s" };
        }

        console.log(`[usePrivyFeeTransfer] Approval confirmed on-chain ✓ allowance=${result.allowance} USDC`, txHash);
        return { success: true, txHash: txHash || "userop" };
      } catch (err: any) {
        console.error("[usePrivyFeeTransfer] Approval failed:", err);
        return {
          success: false,
          error: err?.message || "approval_failed",
        };
      }
    },
    [sendTransaction, walletAddress],
  );

  return { approveFeeAllowance, approvalCapUsdc: APPROVAL_CAP_USDC };
}
