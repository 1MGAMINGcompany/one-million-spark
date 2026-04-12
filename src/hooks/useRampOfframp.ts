/**
 * useRampOfframp — Opens the Ramp Network off-ramp widget (sell USDC for fiat).
 *
 * Flow:
 *   1. Swap USDC.e → Native USDC (reuses useSwapUsdceToNative)
 *   2. Open Ramp widget in OFFRAMP mode
 *   3. When Ramp fires SEND_CRYPTO, we transfer native USDC to their deposit address
 *   4. Report txHash back to Ramp so they release fiat
 *
 * Gated: does nothing if VITE_RAMP_API_KEY is not set.
 */
import { useCallback, useState } from "react";
import { RampInstantSDK } from "@ramp-network/ramp-instant-sdk";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, parseAbi } from "viem";
import { usePrivyWallet } from "./usePrivyWallet";
import { useSwapUsdceToNative } from "./useSwapUsdceToNative";
import { RAMP_API_KEY, RAMP_ENABLED, RAMP_OFFRAMP_ASSET, RAMP_APP_NAME } from "@/lib/rampConfig";
import { USDC_DECIMALS } from "@/lib/polygon-tokens";
import { toast } from "sonner";

/** Native USDC on Polygon */
const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

export function useRampOfframp() {
  const { walletAddress } = usePrivyWallet();
  const { sendTransaction } = useSendTransaction();
  const { executeSwap, swapping } = useSwapUsdceToNative();
  const [launching, setLaunching] = useState(false);

  /**
   * Start the fiat cash-out flow.
   * @param amountUsdc Amount of USDC to sell
   * @returns true if the widget was opened successfully
   */
  const startOfframp = useCallback(
    async (amountUsdc: number): Promise<boolean> => {
      if (!RAMP_ENABLED || !walletAddress) {
        toast.error("Fiat cash-out is not available yet.");
        return false;
      }

      setLaunching(true);

      try {
        // Step 1: Swap USDC.e → native USDC
        toast.info("Preparing your funds for cash-out…");
        const swapOk = await executeSwap(amountUsdc);
        if (!swapOk) {
          toast.error("Could not convert funds. Please try again.");
          return false;
        }

        // Brief delay for swap to settle
        await new Promise((r) => setTimeout(r, 3000));

        // Step 2: Open Ramp widget
        const rawAmount = BigInt(Math.floor(amountUsdc * 10 ** USDC_DECIMALS)).toString();

        const ramp = new RampInstantSDK({
          hostApiKey: RAMP_API_KEY!,
          hostAppName: RAMP_APP_NAME,
          enabledFlows: ["OFFRAMP"],
          defaultFlow: "OFFRAMP",
          offrampAsset: RAMP_OFFRAMP_ASSET,
          swapAmount: rawAmount,
          userAddress: walletAddress,
          useSendCryptoCallback: true,
        });

        // Handle the SEND_CRYPTO event — Ramp tells us where to send the USDC
        ramp.onSendCrypto(async (_assetInfo: any, amount: string, address: string) => {
          try {
            const transferAmount = BigInt(amount);
            const data = encodeFunctionData({
              abi: parseAbi([
                "function transfer(address to, uint256 amount) returns (bool)",
              ]),
              functionName: "transfer",
              args: [address as `0x${string}`, transferAmount],
            });

            const receipt: any = await sendTransaction(
              {
                to: USDC_NATIVE,
                chainId: 137,
                data,
              },
              {
                sponsor: true,
                uiOptions: {
                  description: `Send USDC to complete cash-out`,
                  buttonText: "Send",
                },
              },
            );

            const txHash =
              typeof receipt === "object" && receipt?.hash
                ? receipt.hash
                : String(receipt);

            return { txHash };
          } catch (err: any) {
            console.error("[useRampOfframp] send failed:", err);
            toast.error("Transfer to cash-out provider failed.");
            throw err;
          }
        });

        ramp.on("*" as any, (event: any) => {
          if (event?.type === "WIDGET_CLOSE") {
            console.log("[useRampOfframp] widget closed");
          }
        });

        ramp.show();
        return true;
      } catch (err: any) {
        console.error("[useRampOfframp] error:", err);
        toast.error("Could not start cash-out. Please try again.");
        return false;
      } finally {
        setLaunching(false);
      }
    },
    [walletAddress, executeSwap, sendTransaction],
  );

  return { startOfframp, launching, swapping, isAvailable: RAMP_ENABLED };
}
