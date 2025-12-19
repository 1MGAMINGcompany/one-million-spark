import React, { ReactNode, useMemo, useCallback, useState, createContext, useContext } from "react";
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

// Custom wallet modal using the standard wallet adapter
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { wallets, select, connect, connecting, connected, publicKey } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
    
    console.log("📋 Wallet ready state:", walletAdapter.readyState, "isMobile:", isMobile);
    
    // On mobile or if wallet not installed, use deep link
    if (isMobile && !isInstalled) {
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
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
  }, [wallets, select, isMobile, setVisible]);

  // Close modal when connected
  React.useEffect(() => {
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
          {isMobile 
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
            
            return (
              <button
                key={wallet.adapter.name}
                onClick={() => handleConnect(wallet.adapter.name)}
                disabled={isCurrentlyConnecting}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  connectingWallet === wallet.adapter.name
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
                  <p className="font-medium text-foreground">{wallet.adapter.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {connectingWallet === wallet.adapter.name 
                      ? "Connecting..." 
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

        {isMobile && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              For best experience, open this page in your wallet's built-in browser
            </p>
          </div>
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
