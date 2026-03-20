/**
 * usePrivyFeeTransfer — Client-side USDC fee transfer via Privy smart wallet.
 *
 * Smart wallets sign without popups when dashboard allowlist policies are set,
 * enabling frictionless repeated predictions.
 * The resulting tx hash is passed to the backend for on-chain verification.
 *
 * USDC on Polygon: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 (6 decimals)
 */
import { useCallback } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { polygon } from "viem/chains";
import { encodeFunctionData, parseAbi } from "viem";

const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d" as const;
const USDC_DECIMALS = 6;

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

interface FeeTransferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export function usePrivyFeeTransfer() {
  const { client } = useSmartWallets();

  const transferFee = useCallback(
    async (feeUsdc: number): Promise<FeeTransferResult> => {
      if (feeUsdc <= 0.01) {
        return { success: true, txHash: "fee_below_threshold" };
      }

      if (!client) {
        return { success: false, error: "smart_wallet_not_ready" };
      }

      try {
        const rawAmount = BigInt(Math.floor(feeUsdc * 10 ** USDC_DECIMALS));

        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [TREASURY_WALLET, rawAmount],
        });

        console.log(
          `[usePrivyFeeTransfer] Sending $${feeUsdc} USDC fee via smart wallet...`
        );

        const txHash = await client.sendTransaction({
          chain: polygon,
          to: USDC_CONTRACT,
          data,
          value: 0n,
        });

        if (!txHash) {
          return { success: false, error: "no_tx_hash_returned" };
        }

        console.log("[usePrivyFeeTransfer] Fee tx hash:", txHash);
        return { success: true, txHash };
      } catch (err: any) {
        console.error("[usePrivyFeeTransfer] Fee transfer failed:", err);
        return {
          success: false,
          error: err?.message || "fee_transfer_failed",
        };
      }
    },
    [client]
  );

  return { transferFee };
}
