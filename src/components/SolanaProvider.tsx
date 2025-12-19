import React, { ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext, useRef } from "react";
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletReadyState, WalletName } from "@solana/wallet-adapter-base";
import { getSolanaEndpoint, getSolanaCluster } from "@/lib/solana-config";
import { QRCodeSVG } from "qrcode.react";

// ============================================================
// WALLET ADAPTER CLEANUP - Using Solana Wallet Standard ONLY
// ============================================================
// - NO legacy adapters (PhantomWalletAdapter, SolflareWalletAdapter, etc.)
// - Wallets are auto-discovered via Solana Wallet Standard
// - This resolves Phantom "connecting forever" and duplicate wallets
// ============================================================

// Allowed Solana wallet names - only these will be shown (filters out MetaMask, etc.)
const ALLOWED_WALLETS = new Set(["Phantom", "Solflare", "Backpack"]);

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
    if (connected || connecting || hasAttemptedConnect) return;

    const walletBrowser = detectWalletBrowser();
    
    if (walletBrowser) {
      const walletAdapter = wallets.find(w => w.adapter.name === walletBrowser);
      
      if (walletAdapter && (walletAdapter.readyState === WalletReadyState.Installed || walletAdapter.readyState === WalletReadyState.Loadable)) {
        setHasAttemptedConnect(true);
        
        select(walletAdapter.adapter.name);
        
        setTimeout(async () => {
          try {
            if (!walletAdapter.adapter.connected) {
              await walletAdapter.adapter.connect();
            }
          } catch (err) {
            // Silent fail for auto-connect - user can manually retry
          }
        }, 500);
      }
    }
  }, [wallets, select, connected, connecting, hasAttemptedConnect]);

  return null;
}

// Check if any wallet providers are injected (for mobile detection)
function hasInjectedWalletProviders(): boolean {
  const win = window as any;
  return !!(
    win.solana ||
    win.phantom?.solana ||
    win.solflare ||
    win.backpack ||
    (win.navigator?.wallets?.length > 0)
  );
}

// Mobile deep-link wallet info
const MOBILE_WALLETS = [
  {
    name: "Phantom",
    icon: "https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg",
    color: "from-[#AB9FF2] to-[#7C3AED]",
    deepLink: (url: string) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  {
    name: "Solflare",
    icon: "https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg",
    color: "from-[#FC7227] to-[#E04A00]",
    deepLink: (url: string) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}`,
  },
  {
    name: "Backpack",
    icon: "https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg",
    color: "from-[#E33E3F] to-[#B91C1C]",
    deepLink: (url: string) => `https://backpack.app/ul/browse/${encodeURIComponent(url)}`,
    installUrl: "https://backpack.app/download",
  },
];

// Mobile deep-link screen component
function MobileWalletDeepLinks({ onClose }: { onClose: () => void }) {
  const currentUrl = window.location.href;

  const handleOpenWallet = (wallet: typeof MOBILE_WALLETS[0]) => {
    window.location.href = wallet.deepLink(currentUrl);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-cinzel text-foreground">Connect Wallet</h2>
          <button 
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-6 text-center">
          Open this page in your wallet's browser to connect
        </p>

        <div className="space-y-3">
          {MOBILE_WALLETS.map((wallet) => (
            <button
              key={wallet.name}
              onClick={() => handleOpenWallet(wallet)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-gradient-to-r ${wallet.color} hover:scale-[1.02] transition-all shadow-lg`}
            >
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <img 
                  src={wallet.icon} 
                  alt={wallet.name}
                  className="w-8 h-8"
                  onError={(e) => {
                    // Fallback if icon fails to load
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-white text-lg">
                  Open in {wallet.name}
                </p>
                <p className="text-xs text-white/80">
                  Tap to open in wallet browser
                </p>
              </div>
              <svg 
                className="w-5 h-5 text-white/80" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          ))}
        </div>

        <div className="mt-6 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground text-center">
            💡 Wallet apps have built-in browsers that allow you to connect securely
          </p>
        </div>

        <div className="flex items-center justify-center mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Solana Mainnet
          </p>
        </div>
      </div>
    </div>
  );
}

// Desktop QR Code section component
function DesktopQRCodeSection() {
  const [showQR, setShowQR] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string>("Phantom");
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const walletOptions = [
    { name: "Phantom", color: "bg-[#AB9FF2]" },
    { name: "Solflare", color: "bg-[#FC7227]" },
    { name: "Backpack", color: "bg-[#E33E3F]" },
  ];

  // Get the deep link URL for the selected wallet
  const qrUrl = useMemo(() => {
    const deepLinkInfo = WALLET_DEEP_LINKS[selectedWallet];
    if (deepLinkInfo) {
      return deepLinkInfo.deepLink(currentUrl);
    }
    return currentUrl;
  }, [selectedWallet, currentUrl]);

  if (!showQR) {
    return (
      <button
        onClick={() => setShowQR(true)}
        className="w-full mt-4 p-3 bg-muted/30 hover:bg-muted/50 border border-border/50 rounded-lg transition-all flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
        Scan QR with mobile wallet
      </button>
    );
  }

  return (
    <div className="mt-4 p-4 bg-muted/30 border border-border/50 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-foreground">Scan with wallet app</p>
        <button
          onClick={() => setShowQR(false)}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Wallet selector tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-lg">
        {walletOptions.map((wallet) => (
          <button
            key={wallet.name}
            onClick={() => setSelectedWallet(wallet.name)}
            className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
              selectedWallet === wallet.name
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {wallet.name}
          </button>
        ))}
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="bg-white p-3 rounded-xl shadow-inner">
          <QRCodeSVG
            value={qrUrl}
            size={160}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        Open {selectedWallet} app → Scan → Connect
      </p>
    </div>
  );
}

// Custom wallet modal using the standard wallet adapter
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { wallets, select, wallet, connecting, connected, publicKey } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Detect if we're inside a wallet browser
  const walletBrowser = detectWalletBrowser();
  
  // Check if we have any injected wallet providers
  const hasInjectedWallets = useMemo(() => hasInjectedWalletProviders(), []);

  // Track pending wallet selection for connect-on-next-tick
  const pendingWalletRef = useRef<string | null>(null);
  
  // Track connection timeout for retry suggestion
  const [showRetryHint, setShowRetryHint] = useState(false);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Filter to only show allowed Solana wallets (no MetaMask or EVM wallets)
  // With wallet-standard, wallets are auto-discovered - we just filter the list
  const filteredWallets = useMemo(() => {
    const seen = new Set<string>();
    return wallets.filter(w => {
      const name = w.adapter.name;
      // Only allow Phantom, Solflare, Backpack - no duplicates, no MetaMask
      if (!ALLOWED_WALLETS.has(name)) return false;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }, [wallets]);
  
  // Determine if we should show mobile deep-link UI
  const showMobileDeepLinks = isMobile && !hasInjectedWallets && !walletBrowser;

  const handleConnect = useCallback(async (walletName: string) => {
    setError(null);
    setShowRetryHint(false);
    
    // Clear any existing timeout
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
    }
    
    // Find the wallet adapter
    const walletAdapter = filteredWallets.find(w => w.adapter.name === walletName);
    if (!walletAdapter) {
      setError(`${walletName} wallet not found`);
      return;
    }

    const isInstalled = walletAdapter.readyState === WalletReadyState.Installed || 
                        walletAdapter.readyState === WalletReadyState.Loadable;
    
    // On mobile and wallet not installed (and we're not in the wallet's browser), use deep link
    if (isMobile && !isInstalled && !walletBrowser) {
      const deepLinkInfo = WALLET_DEEP_LINKS[walletName];
      if (deepLinkInfo) {
        window.location.href = deepLinkInfo.deepLink(window.location.href);
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
      pendingWalletRef.current = walletName;
      
      // Set a timeout to show retry hint if connection hangs
      connectTimeoutRef.current = setTimeout(() => {
        setShowRetryHint(true);
      }, 5000); // Show hint after 5 seconds
      
      select(walletName as WalletName);
      
    } catch (err: unknown) {
      setError("Failed to select wallet");
      setConnectingWallet(null);
      pendingWalletRef.current = null;
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
    }
  }, [filteredWallets, select, isMobile, walletBrowser]);

  // Connect on next tick after wallet selection (avoids stale state / WalletNotSelected errors)
  useEffect(() => {
    const pendingWallet = pendingWalletRef.current;
    if (!pendingWallet) return;
    
    // Check if the wallet is now selected
    if (!wallet || wallet.adapter.name !== pendingWallet) {
      return;
    }
    
    // Clear pending immediately to prevent double-connect
    pendingWalletRef.current = null;
    
    // Use setTimeout(0) to connect on next tick
    const timer = setTimeout(async () => {
      try {
        await wallet.adapter.connect();
        
        // Clear timeout on success
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
        }
        
        setVisible(false);
        setConnectingWallet(null);
        setShowRetryHint(false);
      } catch (err: unknown) {
        // Clear timeout on error
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
        }
        
        const error = err as { code?: number; message?: string; name?: string };
        
        // Handle user rejection
        if (error.code === 4001 || error.message?.includes('rejected') || error.message?.includes('User rejected')) {
          setError("Connection cancelled by user");
        } else if (error.code === -32603) {
          setError("Connection failed. Try opening in the wallet's browser.");
        } else {
          setError(error.message || "Failed to connect wallet");
        }
        setConnectingWallet(null);
        setShowRetryHint(false);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [wallet, setVisible]);

  // Close modal when connected
  useEffect(() => {
    if (connected && publicKey && visible) {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
      setVisible(false);
      setConnectingWallet(null);
      setShowRetryHint(false);
    }
  }, [connected, publicKey, visible, setVisible]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
    };
  }, []);

  if (!visible) return null;

  // Show mobile deep-link UI when on mobile with no injected wallets
  if (showMobileDeepLinks) {
    return <MobileWalletDeepLinks onClose={() => setVisible(false)} />;
  }

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
        
        {/* Retry hint when connection is taking too long */}
        {showRetryHint && connectingWallet && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-200">
              Having trouble with {connectingWallet}?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Try {connectingWallet === "Phantom" ? "Solflare" : "Phantom"} instead, or refresh and try again.
            </p>
            <button
              onClick={() => {
                setConnectingWallet(null);
                setShowRetryHint(false);
                if (connectTimeoutRef.current) {
                  clearTimeout(connectTimeoutRef.current);
                }
              }}
              className="text-xs text-amber-400 hover:text-amber-300 mt-2 underline"
            >
              Cancel and try another wallet
            </button>
          </div>
        )}

        <div className="space-y-2">
          {filteredWallets.map((walletItem) => {
            const isInstalled = walletItem.readyState === WalletReadyState.Installed || 
                               walletItem.readyState === WalletReadyState.Loadable;
            const isCurrentlyConnecting = connecting || connectingWallet === walletItem.adapter.name;
            const showAsAvailable = isInstalled || isMobile;
            const deepLinkInfo = WALLET_DEEP_LINKS[walletItem.adapter.name];
            const isCurrentWalletBrowser = walletBrowser === walletItem.adapter.name;
            
            return (
              <button
                key={walletItem.adapter.name}
                onClick={() => handleConnect(walletItem.adapter.name)}
                disabled={isCurrentlyConnecting}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isCurrentWalletBrowser
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : connectingWallet === walletItem.adapter.name
                      ? "border-primary bg-primary/20"
                      : showAsAvailable 
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
                  <p className="font-medium text-foreground">
                    {walletItem.adapter.name}
                    {isCurrentWalletBrowser && <span className="text-primary ml-2">★</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {connectingWallet === walletItem.adapter.name 
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

        {filteredWallets.length === 0 && !isMobile && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              No wallets detected. Install Phantom, Solflare, or Backpack to continue.
            </p>
          </div>
        )}

        {isMobile && !walletBrowser && filteredWallets.length > 0 && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              For best experience, open this page in your wallet's built-in browser
            </p>
          </div>
        )}

        {/* QR Code section for desktop users */}
        {!isMobile && (
          <DesktopQRCodeSection />
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

  // ============================================================
  // SOLANA WALLET STANDARD - NO LEGACY ADAPTERS
  // ============================================================
  // Wallets that implement the Solana Wallet Standard are auto-discovered.
  // We pass an EMPTY array - no legacy adapters needed.
  // This prevents:
  //   - Phantom "connecting forever" bug
  //   - Duplicate wallet entries
  //   - MetaMask appearing in the list
  // ============================================================
  const wallets = useMemo(() => {
    // Empty array = rely entirely on auto-discovered standard wallets
    return [];
  }, []);

  // Handle wallet errors silently (user-facing errors are handled in CustomWalletModal)
  const onError = useCallback((error: Error) => {
    if (error.name === 'WalletNotSelectedError') {
      return;
    }
    // Silent in production - errors are handled in the modal UI
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
