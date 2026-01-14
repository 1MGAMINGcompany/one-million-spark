import { useCallback } from "react";
import { useWallet as useSolanaWallet, useConnection } from "@solana/wallet-adapter-react";

export function useWallet() {
  const { publicKey, connected, connecting, disconnect, wallet, connect } = useSolanaWallet();
  const { connection } = useConnection();

  /**
   * Programmatic reconnect for recovery scenarios (e.g., in-app browser disconnect)
   * Returns true if reconnect was successful, false otherwise
   */
  const reconnect = useCallback(async (): Promise<boolean> => {
    if (wallet?.adapter) {
      try {
        console.log("[Wallet] Attempting reconnect via adapter...");
        await wallet.adapter.connect();
        console.log("[Wallet] Reconnect successful");
        return true;
      } catch (e) {
        console.error("[Wallet] Reconnect failed:", e);
        return false;
      }
    }
    
    // Fallback to connect if adapter not available
    if (connect) {
      try {
        console.log("[Wallet] Attempting reconnect via connect()...");
        await connect();
        console.log("[Wallet] Reconnect via connect() successful");
        return true;
      } catch (e) {
        console.error("[Wallet] Reconnect via connect() failed:", e);
        return false;
      }
    }

    console.warn("[Wallet] No wallet adapter or connect function available");
    return false;
  }, [wallet, connect]);

  return {
    address: publicKey?.toBase58() ?? null,
    publicKey,
    isConnected: connected,
    isConnecting: connecting,
    disconnect,
    wallet,
    connection,
    connect,    // Expose native connect
    reconnect,  // NEW: Programmatic reconnect for recovery
  };
}
