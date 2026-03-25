/**
 * useSwapToUsdce — Hook to convert Native USDC → USDC.e via 0x swap.
 */
import { useState, useCallback } from "react";
import { usePrivyWallet } from "./usePrivyWallet";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  permit2?: any;
  allowanceTarget?: string;
}

export function useSwapToUsdce() {
  const { walletAddress } = usePrivyWallet();
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

  const clearQuote = useCallback(() => setQuote(null), []);

  return {
    getQuote,
    clearQuote,
    quote,
    quoting,
    swapping,
    setSwapping,
  };
}
