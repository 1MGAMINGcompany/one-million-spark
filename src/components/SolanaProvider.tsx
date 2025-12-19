import React, { ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
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

// Wallet display info for deep links
interface WalletDeepLink {
  deepLink: (url: string) => string;
  url: string;
}

const WALLET_DEEP_LINKS: Record<string, WalletDeepLink> = {
  "Phantom": {
    url: "https://phantom.app",
    deepLink: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  "Solflare": {
    url: "https://solflare.com",
    deepLink: (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}`,
  },
  "Backpack": {
    url: "https://backpack.app",
    deepLink: (url) => `https://backpack.app/ul/browse/${encodeURIComponent(url)}`,
  },
};

// Detect if we're in a wallet's in-app browser
function detectWalletBrowser(): string | null {
  const isPhantom = !!(window as any).phantom?.solana?.isPhantom || !!(window as any).solana?.isPhantom;
  const isSolflare = !!(window as any).solflare?.isSolflare;
  const isBackpack = !!(window as any).backpack?.isBackpack;
  
  if (isPhantom) return "Phantom";
  if (isSolflare) return "Solflare";
  if (isBackpack) return "Backpack";
  return null;
}

// Component that handles eager connection when inside wallet browser
function WalletAutoConnect() {
  const { wallets, select, connected, connecting, publicKey } = useWallet();
  const [hasAttemptedConnect, setHasAttemptedConnect] = useState(false);

  useEffect(() => {
    // Skip if already connected or connecting
    if (connected || connecting || hasAttemptedConnect) return;

    const walletBrowser = detectWalletBrowser();
    console.log("🔍 Wallet browser detected:", walletBrowser);
    
    if (walletBrowser) {
      // We're inside a wallet's browser - attempt eager connection
      const walletAdapter = wallets.find(w => w.adapter.name === walletBrowser);
      
      if (walletAdapter && (walletAdapter.readyState === WalletReadyState.Installed || walletAdapter.readyState === WalletReadyState.Loadable)) {
        console.log("🚀 Auto-connecting to", walletBrowser, "- detected in wallet browser");
        setHasAttemptedConnect(true);
        
        // Select and connect
        select(walletAdapter.adapter.name);
        
        // Give it a moment then try to connect
        setTimeout(async () => {
          try {
            if (!walletAdapter.adapter.connected) {
              await walletAdapter.adapter.connect();
              console.log("✅ Auto-connected successfully");
            }
          } catch (err) {
            console.log("Auto-connect attempt:", err);
          }
        }, 500);
      }
    }
  }, [wallets, select, connected, connecting, hasAttemptedConnect]);

  // Log connection state changes
  useEffect(() => {
    console.log("👛 Wallet state:", { connected, connecting, publicKey: publicKey?.toString() });
  }, [connected, connecting, publicKey]);

  return null;
}

// Custom wallet modal using the standard wallet adapter
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { wallets, select, connect, connecting, connected, publicKey } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Detect if we're inside a wallet browser
  const walletBrowser = detectWalletBrowser();

  const handleConnect = useCallback(async (walletName: string) => {
    console.log("👆 handleConnect called with:", walletName);
    setError(null);
    
    // Find the wallet adapter
    const walletAdapter = wallets.find(w => w.adapter.name === walletName);
    if (!walletAdapter) {
      console.error("Wallet adapter not found:", walletName);
      setError(`${walletName} wallet not found`);
      return;
    }

    const isInstalled = walletAdapter.readyState === WalletReadyState.Installed || 
                        walletAdapter.readyState === WalletReadyState.Loadable;
    
    console.log("📋 Wallet ready state:", walletAdapter.readyState, "isMobile:", isMobile, "walletBrowser:", walletBrowser);
    
    // On mobile and wallet not installed (and we're not in the wallet's browser), use deep link
    if (isMobile && !isInstalled && !walletBrowser) {
      const deepLinkInfo = WALLET_DEEP_LINKS[walletName];
      if (deepLinkInfo) {
        const deepLink = deepLinkInfo.deepLink(window.location.href);
        console.log("📱 Opening deep link:", deepLink);
        window.location.href = deepLink;
        return;
      }
    }
    
    // If not installed on desktop, show install link
    if (!isInstalled && !isMobile) {
      const deepLinkInfo = WALLET_DEEP_LINKS[walletName];
      if (deepLinkInfo) {
        window.open(deepLinkInfo.url, '_blank');
        return;
      }
    }
    
    try {
      setConnectingWallet(walletName);
      
      // Use the standard wallet adapter select + connect pattern
      console.log("🎯 Selecting wallet:", walletName);
      select(walletAdapter.adapter.name);
      
      // Wait a moment for the selection to be processed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Now connect
      console.log("🔗 Connecting to wallet...");
      await walletAdapter.adapter.connect();
      
      console.log("✅ Connected! Public key:", walletAdapter.adapter.publicKey?.toString());
      
      setVisible(false);
      setConnectingWallet(null);
      
    } catch (err: any) {
      console.error("❌ Connect error:", err);
      console.error("Error name:", err?.name);
      console.error("Error message:", err?.message);
      console.error("Error code:", err?.code);
      
      // Handle user rejection
      if (err?.code === 4001 || err?.message?.includes('rejected') || err?.message?.includes('User rejected')) {
        setError("Connection cancelled by user");
      } else if (err?.code === -32603) {
        // This error often happens in iframes - suggest opening in wallet browser
        setError("Connection failed. Try opening in the wallet's browser.");
      } else {
        setError(err?.message || "Failed to connect wallet");
      }
      setConnectingWallet(null);
    }
  }, [wallets, select, isMobile, walletBrowser, setVisible]);

  // Close modal when connected
  useEffect(() => {
    if (connected && publicKey && visible) {
      console.log("✅ Wallet connected, closing modal");
      setVisible(false);
      setConnectingWallet(null);
    }
  }, [connected, publicKey, visible, setVisible]);

  if (!visible) return null;

  const cluster = getSolanaCluster();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => {
          setVisible(false);
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
              setConnectingWallet(null);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {walletBrowser 
            ? `Tap ${walletBrowser} to connect`
            : isMobile 
              ? "Tap a wallet to connect or open in wallet app"
              : "Select a Solana wallet to connect"
          }
        </p>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
            {error.includes("wallet's browser") && (
              <p className="text-xs text-muted-foreground mt-1">
                Open Phantom/Solflare app → Browser → Enter this URL
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {wallets.map((wallet) => {
            const isInstalled = wallet.readyState === WalletReadyState.Installed || 
                               wallet.readyState === WalletReadyState.Loadable;
            const isCurrentlyConnecting = connecting || connectingWallet === wallet.adapter.name;
            const showAsAvailable = isInstalled || isMobile;
            const deepLinkInfo = WALLET_DEEP_LINKS[wallet.adapter.name];
            const isCurrentWalletBrowser = walletBrowser === wallet.adapter.name;
            
            return (
              <button
                key={wallet.adapter.name}
                onClick={() => handleConnect(wallet.adapter.name)}
                disabled={isCurrentlyConnecting}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isCurrentWalletBrowser
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : connectingWallet === wallet.adapter.name
                      ? "border-primary bg-primary/20"
                      : showAsAvailable 
                        ? "border-primary/30 hover:border-primary hover:bg-primary/10 cursor-pointer" 
                        : "border-border/50 opacity-60"
                }`}
              >
                <img 
                  src={wallet.adapter.icon} 
                  alt={wallet.adapter.name}
                  className="w-8 h-8 rounded-lg"
                />
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">
                    {wallet.adapter.name}
                    {isCurrentWalletBrowser && <span className="text-primary ml-2">★</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {connectingWallet === wallet.adapter.name 
                      ? "Connecting..." 
                      : isCurrentWalletBrowser
                        ? "Tap to connect"
                        : isMobile 
                          ? isInstalled ? "Tap to connect" : "Tap to open"
                          : isInstalled 
                            ? "Detected" 
                            : "Not installed"
                    }
                  </p>
                </div>
                {!isInstalled && !isMobile && deepLinkInfo && (
                  <a
                    href={deepLinkInfo.url}
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

        {wallets.every(w => w.readyState !== WalletReadyState.Installed) && !isMobile && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              No wallets detected. Install one of the wallets above to continue.
            </p>
          </div>
        )}

        {isMobile && !walletBrowser && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              For best experience, open this page in your wallet's built-in browser
            </p>
          </div>
        )}

        <div className="flex items-center justify-center mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Solana Mainnet
          </p>
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
      <WalletAutoConnect />
      <CustomWalletModal />
    </WalletModalContext.Provider>
  );
}

interface SolanaProviderProps {
  children: ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  const endpoint = useMemo(() => getSolanaEndpoint(), []);

  // Initialize wallet adapters - these handle connection properly
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ], []);

  // Handle wallet errors
  const onError = useCallback((error: Error) => {
    if (error.name === 'WalletNotSelectedError') {
      return;
    }
    console.error("Wallet provider error:", error);
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
