/**
 * Wallet utility functions for consistent address handling
 */

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
 * Get opponent wallet from roomPlayers array
 */
export function getOpponentWallet(
  roomPlayers: string[],
  myWallet: string | null | undefined
): string | null {
  if (!myWallet || roomPlayers.length < 2) return null;
  return roomPlayers.find(p => !isSameWallet(p, myWallet)) || null;
}
