// Solana wallet hook - replaces wagmi/Polygon useWallet
import { useWallet as useSolanaWalletAdapter } from "@solana/wallet-adapter-react";

export function useWallet() {
  const { 
    publicKey, 
    connected, 
    connecting, 
    disconnect,
    wallet 
  } = useSolanaWalletAdapter();

  return {
    address: publicKey?.toBase58() || undefined,
    isConnected: connected,
    isConnecting: connecting,
    chainId: undefined, // Solana doesn't use chainId like EVM
    isWrongNetwork: false, // Solana mainnet only
    disconnect,
    switchToPolygon: () => {}, // No-op on Solana
    publicKey,
    wallet,
  };
}
