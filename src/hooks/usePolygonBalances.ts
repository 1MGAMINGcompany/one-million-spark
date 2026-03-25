/**
 * usePolygonBalances — Reads both Native USDC and Bridged USDC.e balances.
 *
 * Exposes a unified "trading balance" (USDC.e) and detects if user
 * has funds in the wrong token that need swapping.
 */
import { useState, useEffect, useCallback } from "react";
import { usePrivyWallet } from "./usePrivyWallet";

const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Circle USDC, 6 dec
const USDC_BRIDGED = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e, 6 dec
const DECIMALS = 6;

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

const BALANCE_OF = "0x70a08231";
const POLL_MS = 15_000;

function pad(addr: string) {
  return addr.slice(2).toLowerCase().padStart(64, "0");
}

async function balanceOf(token: string, owner: string): Promise<bigint | null> {
  const data = BALANCE_OF + pad(owner);
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to: token, data }, "latest"],
  });
  for (const rpc of POLYGON_RPCS) {
    try {
      const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const j = await r.json();
      if (j.result) return BigInt(j.result);
    } catch { /* next */ }
  }
  return null;
}

export type FundingState = "loading" | "no_funds" | "wrong_token" | "funded" | "error";

export interface PolygonBalances {
  /** USDC.e balance (trading-ready) */
  tradingBalance: number | null;
  tradingFormatted: string | null;
  /** Native USDC balance (needs swap) */
  nativeUsdcBalance: number | null;
  nativeUsdcFormatted: string | null;
  /** Computed state */
  fundingState: FundingState;
  isLoading: boolean;
  error: string | null;
  /** Force refresh */
  refetch: () => void;
}

export function usePolygonBalances(): PolygonBalances {
  const { walletAddress, isPrivyUser } = usePrivyWallet();
  const [usdce, setUsdce] = useState<bigint | null>(null);
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const [e, n] = await Promise.all([
        balanceOf(USDC_BRIDGED, walletAddress),
        balanceOf(USDC_NATIVE, walletAddress),
      ]);
      if (e === null && n === null) throw new Error("All RPCs failed");
      setUsdce(e);
      setUsdc(n);
    } catch (err: any) {
      setError(err?.message ?? "Balance fetch failed");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!isPrivyUser || !walletAddress) {
      setUsdce(null);
      setUsdc(null);
      return;
    }
    fetch_();
    const id = setInterval(fetch_, POLL_MS);
    return () => clearInterval(id);
  }, [isPrivyUser, walletAddress, fetch_]);

  const toNum = (v: bigint | null) => v !== null ? Number(v) / 10 ** DECIMALS : null;
  const fmt = (n: number | null) => n !== null ? n.toFixed(2) : null;

  const tradingBalance = toNum(usdce);
  const nativeUsdcBalance = toNum(usdc);

  let fundingState: FundingState = "loading";
  if (error) {
    fundingState = "error";
  } else if (!loading && usdce !== null) {
    const hasTradingFunds = (tradingBalance ?? 0) >= 0.01;
    const hasWrongToken = (nativeUsdcBalance ?? 0) >= 0.01;
    if (hasTradingFunds) fundingState = "funded";
    else if (hasWrongToken) fundingState = "wrong_token";
    else fundingState = "no_funds";
  }

  return {
    tradingBalance,
    tradingFormatted: fmt(tradingBalance),
    nativeUsdcBalance,
    nativeUsdcFormatted: fmt(nativeUsdcBalance),
    fundingState,
    isLoading: loading,
    error,
    refetch: fetch_,
  };
}
