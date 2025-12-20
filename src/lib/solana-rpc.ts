import { Connection, PublicKey } from "@solana/web3.js";
import { getSolanaEndpoint } from "./solana-config";

// Fetch balance using the single Helius RPC endpoint
export async function fetchBalance(
  publicKey: PublicKey,
  connection: Connection
): Promise<{ balance: number; endpoint: string }> {
  try {
    const balance = await connection.getBalance(publicKey, "confirmed");
    return { balance, endpoint: getSolanaEndpoint() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RPC] Balance fetch failed:", msg);
    throw new Error(`RPC error (${getSolanaEndpoint()}): ${msg}`);
  }
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
