import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { solanaRpcRead } from "@/lib/solanaReadProxy";
import { LAMPORTS_PER_SOL } from "@/lib/solana-config";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const POLL_INTERVAL_MS = 10_000;
const LOW_BALANCE_THRESHOLD = 0.01;

interface PrivySolBalance {
  /** Whether user is authenticated via Privy with an embedded Solana wallet */
  isPrivyUser: boolean;
  /** Wallet address (full) */
  walletAddress: string | null;
  /** Balance in SOL */
  balanceSol: number | null;
  /** Whether balance is at or below the low threshold */
  isLowBalance: boolean;
  /** Whether balance is currently loading */
  loading: boolean;
}

export function usePrivySolBalance(): PrivySolBalance {
  const noPrivy: PrivySolBalance = {
    isPrivyUser: false,
    walletAddress: null,
    balanceSol: null,
    isLowBalance: false,
    loading: false,
  };

  if (!PRIVY_APP_ID) return noPrivy;

  return usePrivySolBalanceInner();
}

function usePrivySolBalanceInner(): PrivySolBalance {
  const { ready, authenticated, user } = usePrivy();
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const solanaWallet = user?.linkedAccounts?.find(
    (a: any) => a.type === "wallet" && a.chainType === "solana"
  ) as any;
  const walletAddress: string | null = solanaWallet?.address ?? null;

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      setLoading(true);
      const result = await solanaRpcRead("getBalance", [walletAddress]);
      const lamports = (result as { value?: number })?.value ?? (result as number);
      setBalanceSol(Number(lamports) / LAMPORTS_PER_SOL);
    } catch (e) {
      console.warn("[usePrivySolBalance] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!ready || !authenticated || !walletAddress) return;
    fetchBalance();
    const id = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ready, authenticated, walletAddress, fetchBalance]);

  const isPrivyUser = ready && authenticated && !!walletAddress;

  return {
    isPrivyUser,
    walletAddress,
    balanceSol,
    isLowBalance: balanceSol !== null && balanceSol <= LOW_BALANCE_THRESHOLD,
    loading,
  };
}
