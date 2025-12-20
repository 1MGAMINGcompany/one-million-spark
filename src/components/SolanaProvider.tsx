import React, { ReactNode, useMemo, useCallback } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { getSolanaEndpoint, getSolanaNetwork } from "@/lib/solana-config";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

// Re-export the wallet modal hook from the official package
export { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface SolanaProviderProps {
  children: ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  // Get mainnet endpoint - NEVER devnet/testnet
  const endpoint = useMemo(() => {
    const url = getSolanaEndpoint();
    console.info(`[SolanaProvider] Using RPC endpoint: ${url}`);
    console.info(`[SolanaProvider] Network: ${getSolanaNetwork()}`);
    return url;
  }, []);

  // ============================================================
  // WALLET ADAPTERS - Wallet Standard Auto-Discovery
  // ============================================================
  // Modern wallets (Phantom, Solflare, Backpack, etc.) implement
  // the Solana Wallet Standard and are auto-discovered.
  // We pass an EMPTY array to rely on standard detection.
  // This ensures all detected wallets use the SAME mainnet connection.
  // ============================================================
  const wallets = useMemo(() => [], []);

  // Handle wallet errors - log but don't crash
  const onError = useCallback((error: Error) => {
    // Ignore common non-errors
    if (error.name === 'WalletNotSelectedError') {
      return;
    }
    if (error.name === 'WalletNotReadyError') {
      console.info('[Wallet] Wallet not ready - user may need to install extension');
      return;
    }
    console.warn('[Wallet] Error:', error.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={true}
        onError={onError}
        localStorageKey="1m-gaming-wallet"
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
