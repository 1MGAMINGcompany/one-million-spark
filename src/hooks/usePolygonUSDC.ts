/**
 * usePolygonUSDC — Reads ERC-20 USDC balance AND relayer allowance on Polygon.
 *
 * Uses the Privy embedded EVM wallet address and a public Polygon RPC.
 * Does NOT affect Solana skill-game balances.
 *
 * USDC on Polygon (PoS):
 *   Contract: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
 *   Decimals: 6
 */
import { useState, useEffect, useCallback } from "react";
import { usePrivyWallet } from "./usePrivyWallet";

// Native USDC on Polygon (circle-issued, 6 decimals)
const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_DECIMALS = 6;
const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

const POLL_INTERVAL_MS = 15_000;

// ERC-20 selectors
const BALANCE_OF_SELECTOR = "0x70a08231";
const ALLOWANCE_SELECTOR = "0xdd62ed3e"; // allowance(owner, spender)

/** Fee relayer address — must match the address derived from FEE_RELAYER_PRIVATE_KEY on the backend */
export const FEE_RELAYER_ADDRESS = "0x3b3bf64329CCf08a727e4fEd41821E8534685fAD";

export interface PolygonUSDCBalance {
  /** User's EVM wallet address */
  wallet_address: string | null;
  /** Raw balance as bigint string */
  usdc_balance_raw: string | null;
  /** Human-readable formatted balance (e.g. "12.50") */
  usdc_balance_formatted: string | null;
  /** Numeric balance for calculations */
  usdc_balance: number | null;
  /** Relayer allowance in USDC (numeric) */
  relayer_allowance: number | null;
  chain: "polygon";
  symbol: "USDC";
  is_loading: boolean;
  error: string | null;
}

function padAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

async function rpcCall(callData: string, to: string): Promise<string | null> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data: callData }, "latest"],
  });

  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error) continue;
      if (json.result) return json.result;
    } catch {
      continue;
    }
  }
  return null;
}

export function usePolygonUSDC(): PolygonUSDCBalance {
  const { walletAddress, isPrivyUser } = usePrivyWallet();
  const [balanceRaw, setBalanceRaw] = useState<string | null>(null);
  const [allowanceRaw, setAllowanceRaw] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;

    try {
      setIsLoading(true);
      setError(null);

      // Batch: balance + allowance in parallel
      const balanceData = BALANCE_OF_SELECTOR + padAddress(walletAddress);
      const allowanceData =
        ALLOWANCE_SELECTOR +
        padAddress(walletAddress) +
        padAddress(FEE_RELAYER_ADDRESS);

      const [balResult, allowResult] = await Promise.all([
        rpcCall(balanceData, USDC_CONTRACT),
        rpcCall(allowanceData, USDC_CONTRACT),
      ]);

      if (balResult) {
        setBalanceRaw(BigInt(balResult).toString());
      }
      if (allowResult) {
        setAllowanceRaw(BigInt(allowResult).toString());
      }
      if (!balResult && !allowResult) {
        throw new Error("All RPCs failed");
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to fetch USDC data";
      console.error("[usePolygonUSDC] Error:", msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!isPrivyUser || !walletAddress) {
      setBalanceRaw(null);
      setAllowanceRaw(null);
      setError(null);
      return;
    }

    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPrivyUser, walletAddress, fetchData]);

  // Derive formatted values
  let usdc_balance: number | null = null;
  let usdc_balance_formatted: string | null = null;
  let relayer_allowance: number | null = null;

  if (balanceRaw !== null) {
    usdc_balance = Number(balanceRaw) / 10 ** USDC_DECIMALS;
    usdc_balance_formatted = usdc_balance.toFixed(2);
  }
  if (allowanceRaw !== null) {
    relayer_allowance = Number(allowanceRaw) / 10 ** USDC_DECIMALS;
  }

  return {
    wallet_address: walletAddress,
    usdc_balance_raw: balanceRaw,
    usdc_balance_formatted,
    usdc_balance,
    relayer_allowance,
    chain: "polygon",
    symbol: "USDC",
    is_loading: isLoading,
    error,
  };
}
