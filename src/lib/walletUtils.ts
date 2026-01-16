/**
 * Wallet utility functions for consistent address handling
 */

/** The default Solana pubkey used for empty player slots on-chain */
export const DEFAULT_SOLANA_PUBKEY = "11111111111111111111111111111111";

/**
 * Normalize wallet address for comparison (trim only).
 * Base58 is case-sensitive, so we don't lowercase.
 */
export function normalizeWallet(wallet: string | null | undefined): string {
  return (wallet ?? "").trim();
}

/**
 * Check if two wallet addresses are the same
 */
export function isSameWallet(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeWallet(a) === normalizeWallet(b);
}

/**
 * Check if a wallet address is a placeholder (empty, default pubkey, or synthetic)
 */
export function isPlaceholderWallet(w?: string | null): boolean {
  const s = (w || "").trim();
  if (!s) return true;
  if (s === DEFAULT_SOLANA_PUBKEY) return true;
  return s.startsWith("waiting-") || s.startsWith("error-") || s.startsWith("ai-");
}

/**
 * Check if a wallet address is a real (non-placeholder) wallet
 */
export function isRealWallet(w?: string | null): boolean {
  return !isPlaceholderWallet(w);
}

/**
 * Get opponent wallet from roomPlayers array
 */
export function getOpponentWallet(
  roomPlayers: string[],
  myWallet: string | null | undefined
): string | null {
  if (!myWallet || roomPlayers.length < 2) return null;
  return roomPlayers.find(p => isRealWallet(p) && !isSameWallet(p, myWallet)) || null;
}
