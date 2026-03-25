/**
 * useSwapToUsdce — Hook to convert Native USDC → USDC.e via 0x swap.
 *
 * Handles the full flow: check allowance → approve if needed → execute swap.
 */
import { useState, useCallback } from "react";
import { usePrivyWallet } from "./usePrivyWallet";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, parseAbi } from "viem";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

interface SwapQuote {
  buyAmountFormatted: string;
  sellAmountFormatted: string;
  transaction: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
  allowanceTarget: string | null;
  needsApproval: boolean;
}

/** Read on-chain allowance for Native USDC */
async function readNativeUsdcAllowance(owner: string, spender: string): Promise<bigint> {
  const pad = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
  const data = "0xdd62ed3e" + pad(owner) + pad(spender);
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to: USDC_NATIVE, data }, "latest"],
  });
  for (const rpc of POLYGON_RPCS) {
    try {
      const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const j = await r.json();
      if (j.result) return BigInt(j.result);
    } catch { /* next */ }
  }
  return 0n;
}

export function useSwapToUsdce() {
  const { walletAddress } = usePrivyWallet();
  const { sendTransaction } = useSendTransaction();
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [quote, setQuote] = useState<SwapQuote | null>(null);

  const getQuote = useCallback(async (amountUsdc: number) => {
    if (!walletAddress) return null;
    setQuoting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/swap-to-usdce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          action: "quote",
          wallet_address: walletAddress,
          amount_usdc: amountUsdc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Quote failed");
      setQuote(data);
      return data as SwapQuote;
    } catch (err: any) {
      console.error("[useSwapToUsdce] quote error:", err);
      toast.error(err?.message || "Could not get swap quote");
      return null;
    } finally {
      setQuoting(false);
    }
  }, [walletAddress]);

  /**
   * Full convert flow: approve allowance if needed → send swap tx.
   * Returns true on success.
   */
  const executeSwap = useCallback(async (amountUsdc: number): Promise<boolean> => {
    if (!walletAddress) return false;
    setSwapping(true);
    try {
      // Step 1: Get quote
      toast.info("Getting swap quote…");
      const q = await getQuote(amountUsdc);
      if (!q?.transaction) {
        toast.error("Could not get swap quote. Try again.");
        return false;
      }

      // Step 2: Check if we need to approve the 0x allowance target for Native USDC
      if (q.needsApproval && q.allowanceTarget) {
        const currentAllowance = await readNativeUsdcAllowance(walletAddress, q.allowanceTarget);
        const needed = BigInt(Math.floor(amountUsdc * 1e6));

        if (currentAllowance < needed) {
          toast.info("Approving USDC for swap…");
          console.log("[useSwapToUsdce] Approving", q.allowanceTarget, "for Native USDC");

          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [q.allowanceTarget as `0x${string}`, needed * 10n], // 10x buffer
          });

          await sendTransaction(
            {
              to: USDC_NATIVE,
              data: approveData,
              value: 0,
              chainId: 137,
            },
            {
              sponsor: true,
              uiOptions: {
                description: "Approve USDC for swap to Trading Balance",
                buttonText: "Approve",
              },
            },
          );

          // Wait for approval to propagate
          console.log("[useSwapToUsdce] Approval sent, waiting for confirmation…");
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const updated = await readNativeUsdcAllowance(walletAddress, q.allowanceTarget!);
            if (updated >= needed) {
              console.log("[useSwapToUsdce] Approval confirmed on-chain");
              break;
            }
          }

          // Re-fetch quote after approval (calldata may change)
          const freshQuote = await getQuote(amountUsdc);
          if (!freshQuote?.transaction) {
            toast.error("Could not refresh quote after approval.");
            return false;
          }
          // Use fresh quote for swap
          Object.assign(q, freshQuote);
        }
      }

      // Step 3: Execute the swap
      toast.info(`Converting $${q.sellAmountFormatted} to Trading Balance…`);

      await sendTransaction(
        {
          to: q.transaction.to as `0x${string}`,
          data: q.transaction.data as `0x${string}`,
          value: BigInt(q.transaction.value || "0"),
          chainId: 137,
        },
        {
          sponsor: true,
          uiOptions: {
            description: `Swap $${q.sellAmountFormatted} USDC → USDC.e`,
            buttonText: "Convert",
          },
        },
      );

      toast.success("Conversion submitted! Balance will update shortly.");
      return true;
    } catch (err: any) {
      console.error("[useSwapToUsdce] swap error:", err);
      if (err?.message !== "User rejected the request." && err?.code !== 4001) {
        toast.error(err?.message || "Conversion failed");
      }
      return false;
    } finally {
      setSwapping(false);
    }
  }, [walletAddress, getQuote, sendTransaction]);

  const clearQuote = useCallback(() => setQuote(null), []);

  return {
    getQuote,
    executeSwap,
    clearQuote,
    quote,
    quoting,
    swapping,
  };
}
