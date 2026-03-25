/**
 * usePrivyWallet — EVM wallet hook for Privy embedded wallets (Polygon).
 *
 * This replaces usePrivySolBalance for the prediction flow.
 * Skill games continue to use the separate Solana wallet hooks.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";
const POLL_INTERVAL_MS = 15_000;

interface PrivyWalletState {
  /** Whether user is authenticated via Privy with an EVM wallet */
  isPrivyUser: boolean;
  /** EVM wallet address (0x...) — Smart Wallet preferred */
  walletAddress: string | null;
  /** Embedded EOA address (0x...) — may differ from Smart Wallet */
  eoaAddress: string | null;
  /** Native balance in MATIC (POL) */
  balanceMatic: number | null;
  /** Whether balance is currently loading */
  loading: boolean;
  /** Short display address */
  shortAddress: string | null;
}

export function usePrivyWallet(): PrivyWalletState {
  const noPrivy: PrivyWalletState = {
    isPrivyUser: false,
    walletAddress: null,
    eoaAddress: null,
    balanceMatic: null,
    loading: false,
    shortAddress: null,
  };

  if (!PRIVY_APP_ID) return noPrivy;

  return usePrivyWalletInner();
}

function usePrivyWalletInner(): PrivyWalletState {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [balanceMatic, setBalanceMatic] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Find EVM smart wallet first, then fall back to embedded EOA
  const evmWallet = useMemo(() => {
    // Prefer smart wallet address (ERC-4337 proxy) for prediction flows
    const smartWallet = user?.linkedAccounts?.find(
      (a: any) => a.type === "smart_wallet"
    ) as any;
    if (smartWallet?.address) return smartWallet.address as string;

    // Fallback: embedded EOA wallet
    const linked = user?.linkedAccounts?.find(
      (a: any) => a.type === "wallet" && a.chainType === "ethereum"
    ) as any;
    if (linked?.address) return linked.address as string;

    // Fallback to wallets array
    const w = wallets.find((w) => w.walletClientType === "privy");
    return w?.address ?? null;
  }, [user, wallets]);

  const walletAddress = evmWallet ?? null;

  const shortAddress = useMemo(() => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  // Fetch native MATIC balance via public RPC
  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      setLoading(true);
      const res = await fetch("https://polygon-rpc.com", {
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
    balanceMatic,
    loading,
    shortAddress,
  };
}
