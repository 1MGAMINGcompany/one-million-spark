/**
 * usePrivyFeeTransfer — Client-side USDC fee transfer via Privy embedded wallet.
 *
 * Privy embedded wallets sign without popups, so this is seamless.
 * The resulting tx hash is passed to the backend for on-chain verification.
 *
 * USDC on Polygon: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 (6 decimals)
 */
import { useCallback } from "react";
import { useSendTransaction } from "@privy-io/react-auth";

const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const TREASURY_WALLET = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d";
const USDC_DECIMALS = 6;

// ERC-20 transfer(address,uint256) selector
const TRANSFER_SELECTOR = "0xa9059cbb";

function encodeTransferCalldata(to: string, amountUsdc: number): string {
  const rawAmount = BigInt(Math.floor(amountUsdc * 10 ** USDC_DECIMALS));
  const paddedTo = to.slice(2).toLowerCase().padStart(64, "0");
  const paddedAmount = rawAmount.toString(16).padStart(64, "0");
  return `${TRANSFER_SELECTOR}${paddedTo}${paddedAmount}`;
}

interface FeeTransferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export function usePrivyFeeTransfer() {
  const { sendTransaction } = useSendTransaction();

  const transferFee = useCallback(
    async (feeUsdc: number): Promise<FeeTransferResult> => {
      if (feeUsdc <= 0.01) {
        return { success: true, txHash: "fee_below_threshold" };
      }

      try {
        const calldata = encodeTransferCalldata(TREASURY_WALLET, feeUsdc);

        console.log(
          `[usePrivyFeeTransfer] Sending $${feeUsdc} USDC fee to treasury...`
        );

        const receipt = await sendTransaction(
          {
            to: USDC_CONTRACT as `0x${string}`,
            data: calldata as `0x${string}`,
            value: BigInt(0),
            chainId: 137, // Polygon mainnet
          },
          {
            uiOptions: {
              header: "Platform Fee",
              description: `$${feeUsdc.toFixed(2)} USDC platform fee`,
              buttonText: "Confirm Fee",
            },
          }
        );

        const txHash =
          typeof receipt === "string"
            ? receipt
            : (receipt as any)?.transactionHash ??
              (receipt as any)?.hash ??
              null;

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
    [sendTransaction]
  );

  return { transferFee };
}
