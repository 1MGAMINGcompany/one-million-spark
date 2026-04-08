/**
 * usePrivyWallet — EVM wallet hook for Privy embedded wallets (Polygon).
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { isPrivyConfigured } from "@/lib/privyConfig";

const POLL_INTERVAL_MS = 15_000;

interface PrivyWalletState {
  isPrivyUser: boolean;
  walletAddress: string | null;
  eoaAddress: string | null;
  balanceMatic: number | null;
  loading: boolean;
  shortAddress: string | null;
  walletReady: boolean;
  hydratingWallet: boolean;
}

const NO_PRIVY: PrivyWalletState = {
  isPrivyUser: false,
  walletAddress: null,
  eoaAddress: null,
  balanceMatic: null,
  loading: false,
  shortAddress: null,
  walletReady: false,
  hydratingWallet: false,
};

export function usePrivyWallet(): PrivyWalletState {
  if (!isPrivyConfigured) return NO_PRIVY;
  return usePrivyWalletInner();
}

function usePrivyWalletInner(): PrivyWalletState {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [balanceMatic, setBalanceMatic] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const smartWalletAddress = useMemo(() => {
    const smartWallet = user?.linkedAccounts?.find(
      (a: any) => a.type === "smart_wallet"
    ) as any;
    return (smartWallet?.address as string) ?? null;
  }, [user]);

  const eoaAddress = useMemo(() => {
    const linked = user?.linkedAccounts?.find(
      (a: any) => a.type === "wallet" && a.chainType === "ethereum"
    ) as any;
    if (linked?.address) return linked.address as string;
    const w = wallets.find((w) => w.walletClientType === "privy");
    return w?.address ?? null;
  }, [user, wallets]);

  const walletAddress = smartWalletAddress ?? eoaAddress ?? null;

  const shortAddress = useMemo(() => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  const walletReady = ready && authenticated && !!walletAddress;
  const hydratingWallet = ready && authenticated && !walletAddress;

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      setLoading(true);
      const res = await fetch("https://polygon-bor-rpc.publicnode.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [walletAddress, "latest"],
        }),
      });
      const data = await res.json();
      if (data.result) {
        const wei = BigInt(data.result);
        setBalanceMatic(Number(wei) / 1e18);
      }
    } catch (e) {
      console.warn("[usePrivyWallet] balance fetch error:", e);
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
    eoaAddress,
    balanceMatic,
    loading,
    shortAddress,
    walletReady,
    hydratingWallet,
  };
}
