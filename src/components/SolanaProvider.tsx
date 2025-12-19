import React, { ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext, useRef } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { getSolanaEndpoint, getSolanaCluster } from "@/lib/solana-config";

// Custom modal context
interface WalletModalContextType {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

const WalletModalContext = createContext<WalletModalContextType>({
  visible: false,
  setVisible: () => {},
});

export const useWalletModal = () => useContext(WalletModalContext);

// Allowed wallet names (Wallet Standard will auto-detect these)
const ALLOWED_WALLET_NAMES = ["phantom", "solflare", "backpack"];

// Custom wallet modal - ONLY shows Phantom, Solflare, Backpack
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { wallets, select, connect, wallet, connected, connecting } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const connectingRef = useRef(false);

  // Filter to ONLY our explicitly defined Solana wallets
  const filteredWallets = useMemo(() => {
    return wallets.filter(w => 
      ALLOWED_WALLET_NAMES.some(name => 
        w.adapter.name.toLowerCase().includes(name)
      )
    );
  }, [wallets]);

  // Close modal when connected
  useEffect(() => {
    if (connected && visible) {
      setVisible(false);
      setError(null);
      connectingRef.current = false;
    }
  }, [connected, visible, setVisible]);

  // Watch for wallet selection and auto-connect
  useEffect(() => {
    if (wallet && connectingRef.current && !connected && !connecting) {
      // Wallet is selected, now connect
      const doConnect = async () => {
        try {
          await connect();
          console.log("Wallet connected successfully");
        } catch (err: any) {
          console.error("Connect error:", err);
          setError(err.message || "Failed to connect");
          connectingRef.current = false;
        }
      };
      // Wait one tick to ensure selection is committed
      setTimeout(doConnect, 50);
    }
  }, [wallet, connected, connecting, connect]);

  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Deep link URLs for mobile wallets
  const getDeepLink = (walletName: string): string | null => {
    const currentUrl = encodeURIComponent(window.location.href);
    
    if (walletName.toLowerCase().includes('phantom')) {
      return `https://phantom.app/ul/browse/${currentUrl}`;
    }
    if (walletName.toLowerCase().includes('solflare')) {
      return `https://solflare.com/ul/v1/browse/${currentUrl}`;
    }
    return null;
  };

  const handleSelect = useCallback(async (walletName: string) => {
    console.log("handleSelect called with:", walletName);
    setError(null);
    
    // Check if wallet is installed
    const selectedWallet = filteredWallets.find(w => w.adapter.name === walletName);
    const isInstalled = selectedWallet?.readyState === WalletReadyState.Installed || 
                       selectedWallet?.readyState === WalletReadyState.Loadable;
    
    // On mobile, if wallet not detected, try deep link
    if (isMobile && !isInstalled) {
      const deepLink = getDeepLink(walletName);
      if (deepLink) {
        console.log("Opening deep link:", deepLink);
        window.location.href = deepLink;
        return;
      }
    }

    if (!isInstalled) {
      setError(`${walletName} is not installed`);
      return;
    }
    
    try {
      // Mark that we want to connect after selection
      connectingRef.current = true;
      // Select the wallet - the useEffect will handle connecting
      select(walletName as any);
      console.log("Wallet selected:", walletName);
    } catch (err: any) {
      console.error("Select error:", err);
      setError(err.message || "Failed to select wallet");
      connectingRef.current = false;
    }
  }, [select, filteredWallets, isMobile]);

  if (!visible) return null;

  const cluster = getSolanaCluster();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => setVisible(false)}
      />
      
      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-cinzel text-foreground">Connect Wallet</h2>
          <button 
            onClick={() => setVisible(false)}
            className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Select a Solana wallet to connect
        </p>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          {filteredWallets.map((walletItem) => {
            const isInstalled = walletItem.readyState === WalletReadyState.Installed || 
                               walletItem.readyState === WalletReadyState.Loadable;
            const isCurrentlySelected = wallet?.adapter.name === walletItem.adapter.name;
            
            return (
              <button
                key={walletItem.adapter.name}
                onClick={() => handleSelect(walletItem.adapter.name)}
                disabled={connecting}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isCurrentlySelected && connecting
                    ? "border-primary bg-primary/20"
                    : isInstalled 
                      ? "border-primary/30 hover:border-primary hover:bg-primary/10 cursor-pointer" 
                      : "border-border/50 opacity-60"
                }`}
              >
                <img 
                  src={walletItem.adapter.icon} 
                  alt={walletItem.adapter.name}
                  className="w-8 h-8 rounded-lg"
                />
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">{walletItem.adapter.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isCurrentlySelected && connecting 
                      ? "Connecting..." 
                      : isInstalled 
                        ? "Detected" 
                        : "Not installed"}
                  </p>
                </div>
                {!isInstalled && (
                  <a
                    href={walletItem.adapter.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary hover:underline"
                  >
                    Install
                  </a>
                )}
              </button>
            );
          })}
        </div>

        {filteredWallets.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            No Solana wallets found. Please install Phantom, Solflare, or Backpack.
          </p>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Solana {cluster === "devnet" ? "Devnet" : "Mainnet"}
          </p>
          {cluster === "devnet" && (
            <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded">
              Test Mode
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Custom modal provider
function CustomWalletModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  return (
    <WalletModalContext.Provider value={{ visible, setVisible }}>
      {children}
      <CustomWalletModal />
    </WalletModalContext.Provider>
  );
}

interface SolanaProviderProps {
  children: ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  const endpoint = useMemo(() => getSolanaEndpoint(), []);

  // Empty array - let Wallet Standard auto-detect installed wallets
  // This avoids double-registration warnings for Phantom/Solflare
  const wallets = useMemo(() => [], []);

  // Handle wallet errors gracefully
  const onError = useCallback((error: Error) => {
    // Suppress WalletNotSelectedError since we handle selection ourselves
    if (error.name === 'WalletNotSelectedError') {
      console.log("Wallet not yet selected - waiting for user selection");
      return;
    }
    console.warn("Wallet error:", error.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={true}
        onError={onError}
        localStorageKey="1m-gaming-wallet"
      >
        <CustomWalletModalProvider>
          {children}
        </CustomWalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
