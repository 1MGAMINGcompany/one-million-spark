import { useCallback } from "react";
import { useWallet as useSolanaWallet, useConnection } from "@solana/wallet-adapter-react";
import { usePrivy } from "@privy-io/react-auth";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";

export function useWallet() {
  const { publicKey, connected, connecting, disconnect, wallet, connect } = useSolanaWallet();
  const { connection } = useConnection();

  // Privy auth state (guarded by app ID availability)
  const privyState = PRIVY_APP_ID ? usePrivyInner() : { authenticated: false, privyAddress: null, privyLogin: undefined, privyLogout: undefined };

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

  // Combined state: external wallet OR Privy embedded wallet
  const isConnected = connected || (privyState.authenticated && !!privyState.privyAddress);
  const address = publicKey?.toBase58() ?? privyState.privyAddress ?? null;

  return {
    address,
    publicKey,
    isConnected,
    isConnecting: connecting,
    disconnect,
    wallet,
    connection,
    connect,
    reconnect,
    privyLogin: privyState.privyLogin,
    privyLogout: privyState.privyLogout,
  };
}

/** Inner hook that calls usePrivy – only invoked when PRIVY_APP_ID exists */
function usePrivyInner() {
  const { authenticated, user, login, logout } = usePrivy();

  const solanaWallet = user?.linkedAccounts?.find(
    (a: any) => a.type === "wallet" && a.chainType === "solana"
  ) as any;
  const privyAddress: string | null = solanaWallet?.address ?? null;

  return { authenticated, privyAddress, privyLogin: login, privyLogout: logout };
}
