// Solana network configuration
export const SOLANA_NETWORK = "mainnet-beta" as const;

// Feature flag - set to false to show "Coming Soon" placeholder
export const SOLANA_ENABLED = true;

// Toggle this for testing on devnet
export const USE_DEVNET = false;

// ⚠️ REPLACE "YOUR_HELIUS_API_KEY" WITH YOUR ACTUAL HELIUS API KEY
const HELIUS_API_KEY = "YOUR_HELIUS_API_KEY";

// Mainnet RPC - Helius ONLY (no public fallback)
export const SOLANA_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Devnet endpoint for testing only
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

// Get current RPC endpoint - uses Helius for mainnet
export function getSolanaEndpoint(): string {
  if (USE_DEVNET) {
    return DEVNET_RPC_URL;
  }
  return SOLANA_RPC_URL;
}

// Get current cluster name
export function getSolanaCluster(): "mainnet-beta" | "devnet" {
  return USE_DEVNET ? "devnet" : "mainnet-beta";
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
