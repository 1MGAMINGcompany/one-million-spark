import React, { ReactNode, useMemo, useCallback } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { getSolanaEndpoint, getSolanaNetwork } from "@/lib/solana-config";

// Note: We do NOT import wallet-adapter-react-ui styles since we use custom UI

// Detect wallet in-app browser synchronously (for autoConnect decision)
const getIsInWalletBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
  if (!isMobile) return false;
  
  const win = window as any;
  return !!(
    win.phantom?.solana?.isPhantom ||
    win.solflare?.isSolflare ||
    win.solflare?.isInAppBrowser ||
    win.Solflare ||
    win.solana?.isSolflare
  );
};

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

  // Explicit SolflareWalletAdapter ensures it's available immediately in Solflare's in-app browser
  // where Wallet Standard auto-detection may be slow. Duplicates are automatically deduplicated.
  const wallets = useMemo(() => [
    new SolflareWalletAdapter(),
  ], []);

  // Enable native autoConnect when in a wallet in-app browser
  // This lets the wallet-adapter library handle connection automatically
  const shouldAutoConnect = useMemo(() => {
    const inWalletBrowser = getIsInWalletBrowser();
    console.info(`[SolanaProvider] In wallet browser: ${inWalletBrowser}, autoConnect: ${inWalletBrowser}`);
    return inWalletBrowser;
  }, []);

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
        autoConnect={shouldAutoConnect}
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
