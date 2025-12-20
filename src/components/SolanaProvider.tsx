import React, { ReactNode, useMemo, useCallback } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { getSolanaEndpoint } from "@/lib/solana-config";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

// Re-export the wallet modal hook from the official package
export { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface SolanaProviderProps {
  children: ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  const endpoint = useMemo(() => getSolanaEndpoint(), []);

  // ============================================================
  // SOLANA WALLET STANDARD - NO LEGACY ADAPTERS
  // ============================================================
  // Wallets that implement the Solana Wallet Standard are auto-discovered.
  // We pass an EMPTY array - no legacy adapters needed.
  // This uses the standard WalletModalProvider from @solana/wallet-adapter-react-ui
  // which handles all wallet connections including Phantom, Solflare, Backpack, etc.
  // ============================================================
  const wallets = useMemo(() => [], []);

  // Handle wallet errors silently (user-facing errors are handled by the modal)
  const onError = useCallback((error: Error) => {
    if (error.name === 'WalletNotSelectedError') {
      return;
    }
    console.warn('Wallet error:', error.message);
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
