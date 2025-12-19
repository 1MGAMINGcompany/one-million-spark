// Solana network configuration - MAINNET PRODUCTION ONLY
// NO devnet/testnet/localnet - always mainnet-beta
export const SOLANA_NETWORK = "mainnet-beta" as const;

// Feature flag - Solana is LIVE
export const SOLANA_ENABLED = true;

// Mainnet RPC - Uses environment variable, with public mainnet fallback
// IMPORTANT: No devnet/testnet fallbacks - mainnet only!
const envRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL as string | undefined;

// Log warning if env var not set
if (!envRpcUrl) {
  console.warn("⚠️ [solana-config] VITE_SOLANA_RPC_URL not set - using public mainnet RPC (rate limited)");
}

// Primary: VITE_SOLANA_RPC_URL (Helius mainnet)
// Fallback: Public mainnet RPC (rate limited but always mainnet)
// NEVER use devnet/testnet URLs here
export const SOLANA_RPC_URL = envRpcUrl || "https://api.mainnet-beta.solana.com";

// Log the RPC being used for debugging
console.log("[solana-config] ═══════════════════════════════════════");
console.log("[solana-config] Network:", SOLANA_NETWORK);
console.log("[solana-config] RPC URL:", SOLANA_RPC_URL);
console.log("[solana-config] Env var set:", !!envRpcUrl);
console.log("[solana-config] ═══════════════════════════════════════");

// Get current RPC endpoint (mainnet only)
export function getSolanaEndpoint(): string {
  return SOLANA_RPC_URL;
}

// Get current cluster name (mainnet only - never devnet/testnet)
export function getSolanaCluster(): "mainnet-beta" {
  return "mainnet-beta";
}

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
