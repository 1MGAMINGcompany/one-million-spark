import { supabase } from "@/integrations/supabase/client";

/**
 * Proxy read-only Solana RPC calls through edge function.
 * This keeps the Helius API key server-side only.
 * 
 * @param method - Solana JSON-RPC method name (must be in allow-list)
 * @param params - Array of parameters for the RPC call
 * @returns The result from the RPC call
 */
export async function solanaRpcRead(method: string, params: unknown[] = []): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("solana-rpc-read", {
    body: { method, params },
  });

  if (error) {
    console.error("[solanaRpcRead] Invoke error:", error);
    throw new Error(error.message || "solana-rpc-read failed");
  }
  
  if (!data?.ok) {
    console.error("[solanaRpcRead] RPC error:", data?.error);
    throw new Error(data?.error || "solana-rpc-read error");
  }
  
  return data.result;
}

/**
 * Decode base64 account data returned by Solana JSON-RPC into Buffer.
 * Solana returns: { data: ["base64string", "base64"], lamports, owner, ... }
 */
export function decodeAccountDataBase64(accountInfo: unknown): Buffer | null {
  try {
    const account = accountInfo as { data?: unknown[] };
    const data = account?.data;
    
    // Expect [base64, encoding] format
    if (!Array.isArray(data) || typeof data[0] !== "string") {
      return null;
    }
    
    return Buffer.from(data[0], "base64");
  } catch {
    return null;
  }
}
