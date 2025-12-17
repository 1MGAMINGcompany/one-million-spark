import { useWallet as useSolanaWallet, useConnection } from "@solana/wallet-adapter-react";

export function useWallet() {
  const { publicKey, connected, connecting, disconnect, wallet } = useSolanaWallet();
  const { connection } = useConnection();

  return {
    address: publicKey?.toBase58() ?? null,
    publicKey,
    isConnected: connected,
    isConnecting: connecting,
    disconnect,
    wallet,
    connection,
  };
}
