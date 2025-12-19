import React, { ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext, useRef } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
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

// Allowed wallet names
const ALLOWED_WALLET_NAMES = ["phantom", "solflare", "backpack"];

// Custom wallet modal - ONLY shows Phantom, Solflare, Backpack
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { wallets, select, connect, wallet, connected, connecting, publicKey } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const pendingWalletRef = useRef<string | null>(null);

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
      console.log("✅ Wallet connected:", publicKey?.toBase58());
      setVisible(false);
      setError(null);
      setIsConnecting(false);
      pendingWalletRef.current = null;
    }
  }, [connected, visible, setVisible, publicKey]);

  // Watch for wallet selection and trigger connect on next tick
  useEffect(() => {
    if (wallet && pendingWalletRef.current === wallet.adapter.name && !connected && !connecting) {
      console.log("🔄 Wallet selected, triggering connect on next tick:", wallet.adapter.name);
      
      // Use setTimeout to ensure select() has fully committed
      const timer = setTimeout(async () => {
        try {
          console.log("🔌 Calling connect()...");
          await connect();
          console.log("✅ Connect succeeded");
        } catch (err: any) {
          // Log the FULL error object for debugging
          console.error("❌ Connect error (full object):", err);
          console.error("Error name:", err?.name);
          console.error("Error message:", err?.message);
          console.error("Error stack:", err?.stack);
          
          const errorMessage = err?.message || err?.name || "Failed to connect wallet";
          setError(errorMessage);
          setIsConnecting(false);
          pendingWalletRef.current = null;
        }
      }, 100); // Wait 100ms for state to settle
      
      return () => clearTimeout(timer);
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
    console.log("👆 handleSelect called with:", walletName);
    setError(null);
    
    // Check if wallet is installed
    const selectedWallet = filteredWallets.find(w => w.adapter.name === walletName);
    const isInstalled = selectedWallet?.readyState === WalletReadyState.Installed || 
                       selectedWallet?.readyState === WalletReadyState.Loadable;
    
    console.log("📋 Wallet ready state:", selectedWallet?.readyState, "isInstalled:", isInstalled);
    
    // On mobile, if wallet not detected, try deep link
    if (isMobile && !isInstalled) {
      const deepLink = getDeepLink(walletName);
      if (deepLink) {
        console.log("📱 Opening deep link:", deepLink);
        window.location.href = deepLink;
        return;
      }
    }

    if (!isInstalled) {
      setError(`${walletName} is not installed. Please install it first.`);
      return;
    }
    
    try {
      setIsConnecting(true);
      // Store the wallet name we're trying to connect
      pendingWalletRef.current = walletName;
      
      // First, select the wallet
      console.log("🎯 Calling select():", walletName);
      select(walletName as any);
      
      // The useEffect above will handle connecting after selection is committed
    } catch (err: any) {
      console.error("❌ Select error (full object):", err);
      setError(err?.message || "Failed to select wallet");
      setIsConnecting(false);
      pendingWalletRef.current = null;
    }
  }, [select, filteredWallets, isMobile]);

  if (!visible) return null;

  const cluster = getSolanaCluster();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => {
          setVisible(false);
          setIsConnecting(false);
          pendingWalletRef.current = null;
        }}
      />
      
      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-cinzel text-foreground">Connect Wallet</h2>
          <button 
            onClick={() => {
              setVisible(false);
              setIsConnecting(false);
              pendingWalletRef.current = null;
            }}
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
            const isCurrentlyConnecting = isConnecting && pendingWalletRef.current === walletItem.adapter.name;
            
            return (
              <button
                key={walletItem.adapter.name}
                onClick={() => handleSelect(walletItem.adapter.name)}
                disabled={isConnecting}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isCurrentlyConnecting
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
                    {isCurrentlyConnecting 
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
  const cluster = getSolanaCluster();
  const network = cluster === "devnet" ? WalletAdapterNetwork.Devnet : WalletAdapterNetwork.Mainnet;

  // EXPLICITLY create legacy adapters - disable Wallet Standard auto-registration
  // by providing explicit adapters, the wallet-adapter won't double-register
  const wallets = useMemo(() => {
    console.log("🔧 Initializing wallet adapters for network:", network);
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new BackpackWalletAdapter(),
    ];
  }, [network]);

  // Handle wallet errors - log full error for debugging
  const onError = useCallback((error: Error) => {
    // Suppress WalletNotSelectedError since we handle selection ourselves
    if (error.name === 'WalletNotSelectedError') {
      console.log("ℹ️ Wallet not yet selected - waiting for user selection");
      return;
    }
    // Log full error details
    console.error("🚨 Wallet provider error:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error
    });
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={false}
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
