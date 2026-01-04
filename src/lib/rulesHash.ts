/**
 * Utility to compute a deterministic hash of ranked game rules
 * Used for cryptographic verification that both players agreed to the same terms
 */

export interface RankedRules {
  stakeLamports: number;
  turnTimeSeconds: number;
  platformFeePct: number; // e.g., 5 for 5%
  roomPda: string;
}

/**
 * Compute a SHA-256 hash of the ranked rules
 * This ensures both players are signing agreement to the exact same terms
 */
export async function computeRulesHash(rules: RankedRules): Promise<string> {
  // Create a deterministic string representation
  const rulesString = [
    `stake:${rules.stakeLamports}`,
    `turnTime:${rules.turnTimeSeconds}`,
    `fee:${rules.platformFeePct}`,
    `room:${rules.roomPda}`,
  ].join("|");

  // Use Web Crypto API to compute SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(rulesString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  
  return hashHex;
}

/**
 * Build the message string for wallet signature
 * Format: 1MG_ACCEPT_V1|<roomPda>|<wallet>|<rulesHash>|<nonce>|<timestamp>
 */
export function buildAcceptMessage(
  roomPda: string,
  wallet: string,
  rulesHash: string,
  nonce: string,
  timestampMs: number
): string {
  return `1MG_ACCEPT_V1|${roomPda}|${wallet}|${rulesHash}|${nonce}|${timestampMs}`;
}

/**
 * Parse an accept message back into its components
 */
export function parseAcceptMessage(message: string): {
  version: string;
  roomPda: string;
  wallet: string;
  rulesHash: string;
  nonce: string;
  timestampMs: number;
} | null {
  const parts = message.split("|");
  if (parts.length !== 6 || parts[0] !== "1MG_ACCEPT_V1") {
    return null;
  }
  
  return {
    version: parts[0],
    roomPda: parts[1],
    wallet: parts[2],
    rulesHash: parts[3],
    nonce: parts[4],
    timestampMs: parseInt(parts[5], 10),
  };
}
