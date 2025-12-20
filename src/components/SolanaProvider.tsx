import React, { ReactNode, useMemo, useCallback } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { getSolanaEndpoint, getSolanaNetwork } from "@/lib/solana-config";

// IMPORTANT: Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

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

  // Explicitly add wallet adapters for desktop compatibility
  // These will be detected alongside standard wallet discovery
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ], []);

  // Handle wallet errors - log but don't crash
  const onError = useCallback((error: Error) => {
    if (error.name === 'WalletNotSelectedError') return;
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
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
