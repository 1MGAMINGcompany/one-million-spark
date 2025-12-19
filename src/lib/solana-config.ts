// Solana network configuration - MAINNET PRODUCTION
export const SOLANA_NETWORK = "mainnet-beta" as const;

// Feature flag - Solana is LIVE
export const SOLANA_ENABLED = true;

// Mainnet RPC - Uses environment variable, with Helius public fallback
const envRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL as string | undefined;
if (!envRpcUrl) {
  console.warn("⚠️ VITE_SOLANA_RPC_URL not set - using public RPC (rate limited)");
}
export const SOLANA_RPC_URL = envRpcUrl || "https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff";

// Get current RPC endpoint (mainnet only)
export function getSolanaEndpoint(): string {
  return SOLANA_RPC_URL;
}

// Get current cluster name (mainnet only)
export function getSolanaCluster(): "mainnet-beta" {
  return "mainnet-beta";
}

// Platform fee recipient on Solana
export const PLATFORM_FEE_RECIPIENT = "3bcV9vtxeiHsXgNx4qvQbS4ZL4cMUnAg2tF3DZjtmGUj";

// Platform fee in basis points (5% = 500 bps)
export const PLATFORM_FEE_BPS = 500;

// Minimum entry fee in SOL
export const MIN_ENTRY_FEE_SOL = 0.01;

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
