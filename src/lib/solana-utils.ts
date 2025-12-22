import bs58 from "bs58";

/**
 * Normalize a transaction signature to base58 format
 * Mobile Wallet Adapter may return:
 * - Uint8Array
 * - base64 string (contains +, /, =)
 * - base58 string (already correct)
 */
export function normalizeSignature(sig: string | Uint8Array): string {
  if (sig instanceof Uint8Array) {
    console.log("[Sig] Normalizing Uint8Array to base58");
    return bs58.encode(sig);
  }
  
  if (typeof sig === "string" && (sig.includes("+") || sig.includes("/") || sig.includes("="))) {
    console.log("[Sig] Detected base64 signature, converting to base58");
    const bytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    return bs58.encode(bytes);
  }
  
  return sig; // already base58
}
