import { useState, useCallback, useEffect, useRef } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useWallet } from "@/hooks/useWallet";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { MAINNET_GENESIS_HASH } from "@/lib/solana-config";

// Known genesis hashes for cluster identification
const GENESIS_HASHES = {
  [MAINNET_GENESIS_HASH]: "mainnet-beta",
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG": "devnet",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": "testnet",
} as const;

export type ClusterName = "mainnet-beta" | "devnet" | "testnet" | "unknown";

export interface NetworkInfo {
  rpcEndpoint: string;
  genesisHash: string | null;
  cluster: ClusterName;
  isMainnet: boolean;
  loading: boolean;
  error: string | null;
}

export interface BalanceInfo {
  lamports: number | null;
  sol: number | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

export function useSolanaNetwork() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  
  // Network state
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({
    rpcEndpoint: connection.rpcEndpoint,
    genesisHash: null,
    cluster: "unknown",
    isMainnet: false,
    loading: true,
    error: null,
  });
  
  // Balance state - DO NOT default to 0, use null to indicate "not yet fetched"
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo>({
    lamports: null,
    sol: null,
    loading: false,
    error: null,
    lastFetched: null,
  });
  
  const fetchingRef = useRef(false);
  
  // Fetch genesis hash to determine actual cluster
  const fetchNetworkInfo = useCallback(async () => {
    setNetworkInfo(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const genesisHash = await connection.getGenesisHash();
      const cluster = GENESIS_HASHES[genesisHash as keyof typeof GENESIS_HASHES] || "unknown";
      const isMainnet = cluster === "mainnet-beta";
      
      setNetworkInfo({
        rpcEndpoint: connection.rpcEndpoint,
        genesisHash,
        cluster,
        isMainnet,
        loading: false,
        error: null,
      });
      
      console.info(`[Network] Cluster: ${cluster} | Genesis: ${genesisHash.slice(0, 8)}... | RPC: ${connection.rpcEndpoint}`);
      
      return { genesisHash, cluster, isMainnet };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch genesis hash";
      console.error("[Network] Error fetching genesis hash:", errorMsg);
      
      // Fallback: If genesis hash fetch fails but RPC URL contains "mainnet", assume mainnet
      // This handles wallet in-app browsers where RPC calls may fail due to CORS/restrictions
      const rpcUrl = connection.rpcEndpoint.toLowerCase();
      const likelyMainnet = rpcUrl.includes("mainnet");
      
      setNetworkInfo({
        rpcEndpoint: connection.rpcEndpoint,
        genesisHash: null,
        cluster: likelyMainnet ? "mainnet-beta" : "unknown",
        isMainnet: likelyMainnet,
        loading: false,
        error: likelyMainnet ? null : errorMsg, // Don't show error if we can infer mainnet
      });
      
      if (likelyMainnet) {
        console.info(`[Network] Genesis fetch failed, inferring mainnet from RPC URL: ${connection.rpcEndpoint}`);
      }
      
      return likelyMainnet ? { genesisHash: null, cluster: "mainnet-beta" as const, isMainnet: true } : null;
    }
  }, [connection]);
  
  // Fetch balance - single endpoint, no failover needed with Helius
  const fetchBalance = useCallback(async (): Promise<{ lamports: number; sol: number } | null> => {
    if (!connected || !publicKey) {
      setBalanceInfo({
        lamports: null,
        sol: null,
        loading: false,
        error: "Wallet not connected",
        lastFetched: null,
      });
      return null;
    }
    
    // Prevent duplicate fetches
    if (fetchingRef.current) {
      return balanceInfo.lamports !== null 
        ? { lamports: balanceInfo.lamports, sol: balanceInfo.sol! }
        : null;
    }
    
    fetchingRef.current = true;
    setBalanceInfo(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const lamports = await connection.getBalance(publicKey, "confirmed");
      const sol = lamports / LAMPORTS_PER_SOL;
      
      console.info(`[Balance] ${sol.toFixed(6)} SOL via Helius RPC | Address: ${publicKey.toBase58().slice(0, 8)}...`);
      
      setBalanceInfo({
        lamports,
        sol,
        loading: false,
        error: null,
        lastFetched: new Date(),
      });
      
      return { lamports, sol };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[Balance] RPC error:", errorMsg);
      
      // DO NOT set balance to 0 on error - keep previous value or null
      setBalanceInfo(prev => ({
        ...prev,
        loading: false,
        error: `RPC error: ${errorMsg}`,
      }));
      
      return null;
    } finally {
      fetchingRef.current = false;
    }
  }, [connected, publicKey, connection, balanceInfo.lamports, balanceInfo.sol]);
  
  // Fetch network info on mount
  useEffect(() => {
    fetchNetworkInfo();
  }, [fetchNetworkInfo]);
  
  // Fetch balance when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    } else {
      setBalanceInfo({
        lamports: null,
        sol: null,
        loading: false,
        error: null,
        lastFetched: null,
      });
    }
  }, [connected, publicKey]); // Don't include fetchBalance to avoid loops
  
  // Check if app is on wrong network for user's wallet
  const checkNetworkMismatch = useCallback((): string | null => {
    if (!networkInfo.isMainnet && !networkInfo.loading && networkInfo.cluster !== "unknown") {
      return `Wrong network: App is connected to ${networkInfo.cluster} but wallet funds are on Mainnet.`;
    }
    return null;
  }, [networkInfo]);
  
  return {
    // Network info
    networkInfo,
    fetchNetworkInfo,
    checkNetworkMismatch,
    
    // Balance info
    balanceInfo,
    fetchBalance,
    
    // Convenience getters
    isMainnet: networkInfo.isMainnet,
    cluster: networkInfo.cluster,
    rpcEndpoint: networkInfo.rpcEndpoint,
    genesisHash: networkInfo.genesisHash,
    balance: balanceInfo.sol,
    balanceError: balanceInfo.error,
  };
}
