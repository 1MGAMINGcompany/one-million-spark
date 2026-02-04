/**
 * Safe utility functions to prevent runtime crashes from null/undefined values
 * 
 * P0 HOTFIX: These helpers prevent ".trim() of undefined" crashes that occur
 * on mobile wallet browsers and recovery screens.
 */

/**
 * Safely trim a string value, returning empty string if not a string
 * Prevents: "Cannot read property 'trim' of undefined/null"
 */
export function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Safely get a wallet address with trim, never crashes
 * Use for wallet addresses, room PDAs, and other identifiers
 */
export function safeWallet(wallet: string | null | undefined): string {
  return safeTrim(wallet);
}

/**
 * Safely compare two wallet addresses with trim
 * Returns true only if both are non-empty strings and match after trim
 */
export function safeWalletMatch(a: unknown, b: unknown): boolean {
  const trimA = safeTrim(a);
  const trimB = safeTrim(b);
  return trimA !== "" && trimB !== "" && trimA === trimB;
}
