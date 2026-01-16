import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

// ============================================================
// SOLANA NETWORK CONFIGURATION - MAINNET-BETA ONLY (HELIUS RPC)
// ============================================================
// This app ONLY uses mainnet-beta with Helius RPC.
// No devnet, no testnet, no localhost, no public endpoints.
// ============================================================

// FORCE mainnet-beta - never change this
export const SOLANA_NETWORK = WalletAdapterNetwork.Mainnet;
export const SOLANA_CLUSTER = "mainnet-beta" as const;

// Feature flag - Solana is LIVE
export const SOLANA_ENABLED = true;

// Read RPC from environment - NEVER use public shared endpoints
const envRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;

// Validate and normalize the RPC URL
function getValidatedRpcUrl(): string {
  if (!envRpcUrl) {
    console.error("[Solana] VITE_SOLANA_RPC_URL not set - this will cause failures!");
    // Return a known-bad URL that will fail fast instead of silent failures
    return "https://MISSING-RPC-URL.invalid";
  }
  
  let url = String(envRpcUrl).trim();
  
  // Auto-fix missing https://
  if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  
  return url;
}

export const SOLANA_RPC_URL = getValidatedRpcUrl();

// Get current RPC endpoint (Helius mainnet only)
export function getSolanaEndpoint(): string {
  return SOLANA_RPC_URL;
}

// Get network enum for wallet adapters
export function getSolanaNetwork(): WalletAdapterNetwork {
  return SOLANA_NETWORK;
}

// Get current cluster name (mainnet only - never devnet/testnet)
export function getSolanaCluster(): "mainnet-beta" {
  return SOLANA_CLUSTER;
}

// Known genesis hashes for cluster verification
export const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const TESTNET_GENESIS_HASH = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";

// Platform fee recipient on Solana
export const PLATFORM_FEE_RECIPIENT = "3bcV9vtxeiHsXgNx4qvQbS4ZL4cMUnAg2tF3DZjtmGUj";

// Platform fee in basis points (5% = 500 bps)
export const PLATFORM_FEE_BPS = 500;

// Minimum entry fee in SOL (~$0.50 USD)
export const MIN_ENTRY_FEE_SOL = 0.004;

// SOL decimals (lamports)
export const SOL_DECIMALS = 9;
export const LAMPORTS_PER_SOL = 1_000_000_000;

// Format SOL amount
export function formatSol(lamports: number | bigint): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  if (sol >= 1) {
    return sol.toFixed(2);
  } else if (sol >= 0.01) {
    return sol.toFixed(3);
  } else {
    return sol.toFixed(4);
  }
}

// Parse SOL string to lamports
export function parseSolToLamports(sol: string | number): number {
  return Math.floor(Number(sol) * LAMPORTS_PER_SOL);
}

// Detect if running on mobile device
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

// Check if injected wallet (Phantom/Solflare) is available
export function hasInjectedWallet(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as any).solana ||
    (window as any).phantom?.solana ||
    (window as any).solflare ||
    (window as any).backpack
  );
}
