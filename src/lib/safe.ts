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

/**
 * Safely shorten a string for logging - NEVER crashes
 * Prevents: "Cannot read property 'slice' of undefined/null"
 * 
 * @param v - Any value (string, null, undefined, object)
 * @param n - Number of characters to keep (default 8)
 * @returns Shortened string or "unknown"
 */
export function short(v: unknown, n = 8): string {
  return typeof v === "string" ? v.slice(0, n) : "unknown";
}

/**
 * Safely shorten a PublicKey or string for logging - NEVER crashes
 * Handles: string, PublicKey (has toBase58), null, undefined
 * 
 * @param pk - PublicKey, string, null, or undefined
 * @param n - Number of characters to keep (default 8)
 * @returns Shortened base58 string or "unknown"
 */
export function shortPk(pk: unknown, n = 8): string {
  if (typeof pk === "string") {
    return pk.slice(0, n);
  }
  if (pk && typeof pk === "object" && "toBase58" in pk && typeof (pk as any).toBase58 === "function") {
    try {
      return (pk as any).toBase58().slice(0, n);
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}
