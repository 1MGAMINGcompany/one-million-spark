import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_ENDPOINTS, getSolanaEndpoint, getFallbackEndpoint } from "./solana-config";

// RPC request with automatic failover
export async function fetchBalanceWithFailover(
  publicKey: PublicKey,
  primaryConnection: Connection
): Promise<{ balance: number; endpoint: string }> {
  const errors: string[] = [];

  // Try primary endpoint first
  try {
    const balance = await primaryConnection.getBalance(publicKey, "confirmed");
    return { balance, endpoint: getSolanaEndpoint() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Primary (${getSolanaEndpoint()}): ${msg}`);
    console.warn("[RPC] Primary endpoint failed:", msg);
  }

  // Try fallback endpoint
  try {
    const fallbackConnection = new Connection(getFallbackEndpoint(), "confirmed");
    const balance = await fallbackConnection.getBalance(publicKey, "confirmed");
    console.info("[RPC] Fallback endpoint succeeded");
    return { balance, endpoint: getFallbackEndpoint() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Fallback (${getFallbackEndpoint()}): ${msg}`);
    console.warn("[RPC] Fallback endpoint failed:", msg);
  }

  // All endpoints failed - throw with details
  throw new Error(`All RPC endpoints failed:\n${errors.join("\n")}`);
}

// Check if an RPC error is a 403/auth error
export function is403Error(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("403") ||
      msg.includes("forbidden") ||
      msg.includes("access denied") ||
      msg.includes("unauthorized")
    );
  }
  return false;
}
