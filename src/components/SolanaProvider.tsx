import React, { ReactNode, useMemo, useCallback } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { getSolanaEndpoint, getSolanaNetwork } from "@/lib/solana-config";

// Note: We do NOT import wallet-adapter-react-ui styles since we use custom UI

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

  // IMPORTANT: Do NOT add explicit wallet adapters!
  // The wallet-adapter will automatically detect installed wallets via Standard Wallet interface.
  // Adding PhantomWalletAdapter/SolflareWalletAdapter causes DUPLICATES.
  const wallets = useMemo(() => [], []);

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
        autoConnect={false}
        onError={onError}
        localStorageKey="1m-gaming-wallet"
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
