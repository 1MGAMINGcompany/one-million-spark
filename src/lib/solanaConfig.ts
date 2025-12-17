import { Connection, clusterApiUrl, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

// Solana Mainnet-Beta
export const SOLANA_NETWORK = "mainnet-beta" as const;
export const SOLANA_RPC_ENDPOINT = clusterApiUrl(SOLANA_NETWORK);

// Connection instance
export const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");

// Platform fee recipient (Solana address)
export const PLATFORM_FEE_RECIPIENT = new PublicKey("3bcV9vtxeiHsXgNx4qvQbS4ZL4cMUnAg2tF3DZjtmGUj");

// Platform fee in basis points (500 = 5%)
export const PLATFORM_FEE_BPS = 500;

// Minimum entry fee in SOL
export const MIN_ENTRY_FEE_SOL = 0.01;

// SOL decimals (9)
export const SOL_DECIMALS = 9;

// Helper functions
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}

export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function formatSol(lamports: bigint | number): string {
  return lamportsToSol(lamports).toFixed(4);
}

// Validate Solana address
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

console.log("SOLANA_CONFIG_LOADED", {
  network: SOLANA_NETWORK,
  rpcEndpoint: SOLANA_RPC_ENDPOINT,
  feeRecipient: PLATFORM_FEE_RECIPIENT.toBase58(),
});
