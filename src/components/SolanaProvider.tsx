import React, { ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext, useRef } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, WalletAdapterNetwork, WalletAdapter } from "@solana/wallet-adapter-base";
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

// Store legacy adapters globally so we can directly call connect on them
let phantomAdapter: PhantomWalletAdapter | null = null;
let solflareAdapter: SolflareWalletAdapter | null = null;
let backpackAdapter: BackpackWalletAdapter | null = null;

// Custom wallet modal - ONLY shows Phantom, Solflare, Backpack
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { select, connected, publicKey, wallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  // Get adapter info for display
  const walletOptions = useMemo(() => {
    const adapters = [
      { adapter: phantomAdapter, name: "Phantom" },
      { adapter: solflareAdapter, name: "Solflare" },
      { adapter: backpackAdapter, name: "Backpack" },
    ].filter(w => w.adapter !== null);

    return adapters.map(({ adapter, name }) => ({
      name: adapter!.name,
      icon: adapter!.icon,
      url: adapter!.url,
      readyState: adapter!.readyState,
      adapter: adapter!,
    }));
  }, []);

  // Close modal when connected
  useEffect(() => {
    if (connected && visible) {
      console.log("✅ Wallet connected:", publicKey?.toBase58());
      setVisible(false);
      setError(null);
      setIsConnecting(false);
      setConnectingWallet(null);
    }
  }, [connected, visible, setVisible, publicKey]);

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

  const handleSelect = useCallback(async (walletOption: typeof walletOptions[0]) => {
    console.log("👆 handleSelect called with:", walletOption.name);
    setError(null);
    
    const isInstalled = walletOption.readyState === WalletReadyState.Installed || 
                       walletOption.readyState === WalletReadyState.Loadable;
    
    console.log("📋 Wallet ready state:", walletOption.readyState, "isInstalled:", isInstalled);
    
    // On mobile, if wallet not detected, try deep link
    if (isMobile && !isInstalled) {
      const deepLink = getDeepLink(walletOption.name);
      if (deepLink) {
        console.log("📱 Opening deep link:", deepLink);
        window.location.href = deepLink;
        return;
      }
    }

    if (!isInstalled) {
      setError(`${walletOption.name} is not installed. Please install it first.`);
      return;
    }
    
    try {
      setIsConnecting(true);
      setConnectingWallet(walletOption.name);
      
      // DIRECTLY call connect on the legacy adapter - bypasses StandardWalletAdapter
      console.log("🎯 Directly connecting to legacy adapter:", walletOption.name);
      const adapter = walletOption.adapter;
      
      // First, select the wallet in the context
      select(walletOption.name as any);
      
      // Then directly call connect on the legacy adapter
      await adapter.connect();
      
      console.log("✅ Legacy adapter connected successfully");
      
    } catch (err: any) {
      console.error("❌ Connect error:", err);
      console.error("Error name:", err?.name);
      console.error("Error message:", err?.message);
      console.error("Error stack:", err?.stack);
      
      // Check for user rejection
      if (err?.message?.includes('rejected') || err?.message?.includes('User rejected')) {
        setError("Connection cancelled by user");
      } else {
        setError(err?.message || err?.name || "Failed to connect wallet");
      }
      setIsConnecting(false);
      setConnectingWallet(null);
    }
  }, [select, isMobile, walletOptions]);

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
          setConnectingWallet(null);
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
              setConnectingWallet(null);
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
          {walletOptions.map((walletOption) => {
            const isInstalled = walletOption.readyState === WalletReadyState.Installed || 
                               walletOption.readyState === WalletReadyState.Loadable;
            const isCurrentlyConnecting = isConnecting && connectingWallet === walletOption.name;
            
            return (
              <button
                key={walletOption.name}
                onClick={() => handleSelect(walletOption)}
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
                  src={walletOption.icon} 
                  alt={walletOption.name}
                  className="w-8 h-8 rounded-lg"
                />
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">{walletOption.name}</p>
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
                    href={walletOption.url}
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

        {walletOptions.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            Loading wallets...
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

  // Create legacy adapters ONCE and store globally
  const wallets = useMemo(() => {
    console.log("🔧 Initializing legacy wallet adapters for network:", network);
    
    // Create adapters
    phantomAdapter = new PhantomWalletAdapter();
    solflareAdapter = new SolflareWalletAdapter({ network });
    backpackAdapter = new BackpackWalletAdapter();
    
    // Return the array for WalletProvider
    return [phantomAdapter, solflareAdapter, backpackAdapter];
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
