import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

// ============================================================
// SOLANA NETWORK CONFIGURATION - MAINNET-BETA ONLY
// ============================================================
// This app ONLY uses mainnet-beta. No devnet, no testnet, no localhost.
// All wallet adapters, connections, and RPC calls use this configuration.
// ============================================================

// FORCE mainnet-beta - never change this
export const SOLANA_NETWORK = WalletAdapterNetwork.Mainnet;
export const SOLANA_CLUSTER = "mainnet-beta" as const;

// Feature flag - Solana is LIVE
export const SOLANA_ENABLED = true;

// RPC endpoint configuration - MAINNET ONLY
// Primary: Public Solana RPC (reliable, no auth required)
// Fallback: Project Serum public RPC
export const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-api.projectserum.com",
] as const;

// Primary endpoint - always use public mainnet (no 403 issues)
export const SOLANA_RPC_URL = RPC_ENDPOINTS[0];

// Get current RPC endpoint (mainnet only)
export function getSolanaEndpoint(): string {
  return SOLANA_RPC_URL;
}

// Get fallback endpoint
export function getFallbackEndpoint(): string {
  return RPC_ENDPOINTS[1];
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
