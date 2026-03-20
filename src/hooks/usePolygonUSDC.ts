/**
 * usePolygonUSDC — Reads ERC-20 USDC balance on Polygon for prediction users.
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

// ERC-20 balanceOf(address) selector: 0x70a08231
const BALANCE_OF_SELECTOR = "0x70a08231";

export interface PolygonUSDCBalance {
  /** User's EVM wallet address */
  wallet_address: string | null;
  /** Raw balance as bigint string */
  usdc_balance_raw: string | null;
  /** Human-readable formatted balance (e.g. "12.50") */
  usdc_balance_formatted: string | null;
  /** Numeric balance for calculations */
  usdc_balance: number | null;
  chain: "polygon";
  symbol: "USDC";
  is_loading: boolean;
  error: string | null;
}

function padAddress(address: string): string {
  // Remove 0x prefix, left-pad to 64 hex chars
  return address.slice(2).toLowerCase().padStart(64, "0");
}

export function usePolygonUSDC(): PolygonUSDCBalance {
  const { walletAddress, isPrivyUser } = usePrivyWallet();
  const [balanceRaw, setBalanceRaw] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) {
      console.warn("[usePolygonUSDC] No wallet address, skipping fetch");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const data = BALANCE_OF_SELECTOR + padAddress(walletAddress);

      console.log("[usePolygonUSDC] Fetching balance", {
        wallet: walletAddress,
        contract: USDC_CONTRACT,
        rpc: POLYGON_RPC,
      });

      const res = await fetch(POLYGON_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            { to: USDC_CONTRACT, data },
            "latest",
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();

      if (json.error) {
        console.error("[usePolygonUSDC] RPC error:", json.error);
        throw new Error(json.error.message || `RPC error code ${json.error.code}`);
      }

      if (json.result) {
        const raw = BigInt(json.result).toString();
        console.log("[usePolygonUSDC] Balance:", { raw, formatted: (Number(raw) / 10 ** USDC_DECIMALS).toFixed(2) });
        setBalanceRaw(raw);
      } else {
        console.warn("[usePolygonUSDC] Empty result:", json);
        throw new Error("RPC returned empty result");
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to fetch USDC balance";
      console.error("[usePolygonUSDC] Error:", msg, e);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!isPrivyUser || !walletAddress) {
      setBalanceRaw(null);
      setError(null);
      return;
    }

    fetchBalance();
    const id = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPrivyUser, walletAddress, fetchBalance]);

  // Derive formatted values
  let usdc_balance: number | null = null;
  let usdc_balance_formatted: string | null = null;

  if (balanceRaw !== null) {
    usdc_balance = Number(balanceRaw) / 10 ** USDC_DECIMALS;
    usdc_balance_formatted = usdc_balance.toFixed(2);
  }

  return {
    wallet_address: walletAddress,
    usdc_balance_raw: balanceRaw,
    usdc_balance_formatted,
    usdc_balance,
    chain: "polygon",
    symbol: "USDC",
    is_loading: isLoading,
    error,
  };
}
