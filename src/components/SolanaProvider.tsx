import React, { ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
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

// Define our supported wallets with their deep links
interface WalletOption {
  name: string;
  icon: string;
  url: string;
  deepLink: (url: string) => string;
  detectInstalled: () => boolean;
  getProvider: () => any | null;
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    name: "Phantom",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9IiNBQjlGRjIiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00Ni41MjY3IDY5LjkyMjlDNDIuMDA1NCA3Ni44NTA5IDM0LjQyOTIgODUuNjE4MiAyNC4zNDggODUuNjE4MkMxOS41ODI0IDg1LjYxODIgMTUgODMuNjU2MyAxNSA3NS4xMzQyQzE1IDUzLjQzMDUgNDQuNjMyNiAxOS44MzI3IDcyLjEyNjggMTkuODMyN0M4Ny43NjggMTkuODMyNyA5NCAzMC42ODQ2IDk0IDQzLjAwNzlDOTQgNTguODI1OCA4My43MzU1IDc2LjkxMjIgNzMuNTMyMSA3Ni45MTIyQzcwLjI5MzkgNzYuOTEyMiA2OC43MDUzIDc1LjEzNDIgNjguNzA1MyA3Mi4zMTRDNjguNzA1MyA3MS41NzgzIDY4LjgyNzUgNzAuNzgxMiA2OS4wNzE5IDY5LjkyMjlDNjUuNTg5MyA3NS44Njk5IDU4Ljg2ODUgODEuMzg3OCA1Mi41NzU0IDgxLjM4NzhDNDcuOTkzIDgxLjM4NzggNDUuNjcxMyA3OC41MDYzIDQ1LjY3MTMgNzQuNDU5OEM0NS42NzEzIDcyLjk4ODQgNDUuOTc2OCA3MS40NTU2IDQ2LjUyNjcgNjkuOTIyOVpNODMuNjc2MSA0Mi41Nzk0QzgzLjY3NjEgNDYuMTcwNCA4MS41NTc1IDQ3Ljk2NTggNzkuMTg3NSA0Ny45NjU4Qzc2Ljc4MTYgNDcuOTY1OCA3NC42OTg5IDQ2LjE3MDQgNzQuNjk4OSA0Mi41Nzk0Qzc0LjY5ODkgMzguOTg4NSA3Ni43ODE2IDM3LjE5MzEgNzkuMTg3NSAzNy4xOTMxQzgxLjU1NzUgMzcuMTkzMSA4My42NzYxIDM4Ljk4ODUgODMuNjc2MSA0Mi41Nzk0Wk03MC4yMTAzIDQyLjU3OTVDNzAuMjEwMyA0Ni4xNzA0IDY4LjA5MTYgNDcuOTY1OCA2NS43MjE2IDQ3Ljk2NThDNjMuMzE1NyA0Ny45NjU4IDYxLjIzMyA0Ni4xNzA0IDYxLjIzMyA0Mi41Nzk1QzYxLjIzMyAzOC45ODg1IDYzLjMxNTcgMzcuMTkzMSA2NS43MjE2IDM3LjE5MzFDNjguMDkxNiAzNy4xOTMxIDcwLjIxMDMgMzguOTg4NSA3MC4yMTAzIDQyLjU3OTVaIiBmaWxsPSIjRkZGREY4Ii8+Cjwvc3ZnPg==",
    url: "https://phantom.app",
    deepLink: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
    detectInstalled: () => !!(window as any).phantom?.solana?.isPhantom || !!(window as any).solana?.isPhantom,
    getProvider: () => (window as any).phantom?.solana || (window as any).solana,
  },
  {
    name: "Solflare",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImEiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNGRkMxMEIiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNGQjNGMkQiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSIyNTYiIGN5PSIyNTYiIHI9IjI1NiIgZmlsbD0idXJsKCNhKSIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0zNzYuNiAyMzEuNWwtOTMuNC01My45YTUzLjUgNTMuNSAwIDAgMC01My41IDBsLTkzLjQgNTMuOWE1My41IDUzLjUgMCAwIDAtMjYuNyA0Ni4zdjEwNy44YTUzLjUgNTMuNSAwIDAgMCAyNi43IDQ2LjNsOTMuNCA1My45YTUzLjUgNTMuNSAwIDAgMCA1My41IDBsOTMuNC01My45YTUzLjUgNTMuNSAwIDAgMCAyNi43LTQ2LjNWMjc3LjhhNTMuNSA1My41IDAgMCAwLTI2LjctNDYuM3oiLz48L3N2Zz4=",
    url: "https://solflare.com",
    deepLink: (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}`,
    detectInstalled: () => !!(window as any).solflare?.isSolflare,
    getProvider: () => (window as any).solflare,
  },
  {
    name: "Backpack",
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyNCIgZmlsbD0iI0U0M0EzQSIvPjxwYXRoIGQ9Ik00MCA3MkM0MCA2MC45NTQgNDguOTU0IDUyIDYwIDUySDY4QzcyLjQxOCA1MiA3NiA1NS41ODE3IDc2IDYwVjg0Qzc2IDg4LjQxODMgNzIuNDE4IDkyIDY4IDkySDYwQzQ4Ljk1NCA5MiA0MCA4My4wNDYgNDAgNzJaIiBmaWxsPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik01MiA2MEg2OFY3Nkg2MEM1NS41ODE3IDc2IDUyIDcyLjQxODMgNTIgNjhaIiBmaWxsPSIjRTQzQTNBIi8+PHBhdGggZD0iTTY4IDM2QzY4IDMxLjU4MTcgNzEuNTgxNyAyOCA3NiAyOEg4NEM5NS4wNDYgMjggMTA0IDM2Ljk1NCAxMDQgNDhWNTZDMTA0IDY3LjA0NiA5NS4wNDYgNzYgODQgNzZINzZDNzEuNTgxNyA3NiA2OCA3Mi40MTgzIDY4IDY4VjM2WiIgZmlsbD0id2hpdGUiLz48cGF0aCBkPSJNODQgNDRINjhWNjBIODRDODguNDE4MyA2MCA5MiA1Ni40MTgzIDkyIDUyVjUyQzkyIDQ3LjU4MTcgODguNDE4MyA0NCA4NCA0NFoiIGZpbGw9IiNFNDNBM0EiLz48L3N2Zz4=",
    url: "https://backpack.app",
    deepLink: (url) => `https://backpack.app/ul/browse/${encodeURIComponent(url)}`,
    detectInstalled: () => !!(window as any).backpack?.isBackpack,
    getProvider: () => (window as any).backpack,
  },
];

// Custom wallet modal - bypasses wallet-adapter entirely
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { select } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [connectedPublicKey, setConnectedPublicKey] = useState<string | null>(null);
  const [walletStatuses, setWalletStatuses] = useState<Record<string, boolean>>({});

  // Detect which wallets are installed
  useEffect(() => {
    const checkWallets = () => {
      const statuses: Record<string, boolean> = {};
      WALLET_OPTIONS.forEach(wallet => {
        statuses[wallet.name] = wallet.detectInstalled();
      });
      setWalletStatuses(statuses);
      console.log("🔍 Wallet detection:", statuses);
    };
    
    // Check immediately and after a delay (wallets may inject late)
    checkWallets();
    const timer = setTimeout(checkWallets, 500);
    const timer2 = setTimeout(checkWallets, 1500);
    
    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [visible]);

  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const handleConnect = useCallback(async (wallet: WalletOption) => {
    console.log("👆 handleConnect called with:", wallet.name);
    setError(null);
    
    const isInstalled = walletStatuses[wallet.name];
    console.log("📋 Wallet installed:", isInstalled, "isMobile:", isMobile);
    
    // On mobile or if wallet not installed, use deep link
    if (isMobile || !isInstalled) {
      const deepLink = wallet.deepLink(window.location.href);
      console.log("📱 Opening deep link:", deepLink);
      window.location.href = deepLink;
      return;
    }
    
    try {
      setIsConnecting(true);
      setConnectingWallet(wallet.name);
      
      // Get the wallet provider directly from window
      const provider = wallet.getProvider();
      
      if (!provider) {
        throw new Error(`${wallet.name} provider not found`);
      }
      
      console.log("🎯 Connecting directly to provider:", wallet.name, provider);
      
      // Connect directly to the provider, bypassing all adapters
      const response = await provider.connect();
      console.log("✅ Provider connect response:", response);
      
      // Get public key
      const publicKey = response?.publicKey || provider.publicKey;
      if (publicKey) {
        const pubKeyStr = publicKey.toString();
        console.log("✅ Connected! Public key:", pubKeyStr);
        setConnectedPublicKey(pubKeyStr);
        
        // Also select in wallet-adapter context for compatibility
        try {
          select(wallet.name as any);
        } catch (e) {
          console.log("Note: wallet-adapter select failed, but direct connection succeeded");
        }
        
        // Store in localStorage for persistence
        localStorage.setItem("1m-gaming-wallet-connected", wallet.name);
        localStorage.setItem("1m-gaming-wallet-pubkey", pubKeyStr);
        
        setVisible(false);
        setIsConnecting(false);
        setConnectingWallet(null);
        
        // Reload the page to refresh wallet context
        window.location.reload();
      } else {
        throw new Error("No public key returned from wallet");
      }
      
    } catch (err: any) {
      console.error("❌ Connect error:", err);
      console.error("Error name:", err?.name);
      console.error("Error message:", err?.message);
      console.error("Error code:", err?.code);
      
      // Handle user rejection
      if (err?.code === 4001 || err?.message?.includes('rejected') || err?.message?.includes('User rejected')) {
        setError("Connection cancelled by user");
      } else {
        setError(err?.message || "Failed to connect wallet");
      }
      setIsConnecting(false);
      setConnectingWallet(null);
    }
  }, [walletStatuses, isMobile, select, setVisible]);

  if (!visible) return null;

  const cluster = getSolanaCluster();
  const hasAnyWallet = Object.values(walletStatuses).some(v => v);

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
          {isMobile 
            ? "Tap a wallet to open in its app"
            : "Select a Solana wallet to connect"
          }
        </p>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          {WALLET_OPTIONS.map((wallet) => {
            const isInstalled = walletStatuses[wallet.name];
            const isCurrentlyConnecting = isConnecting && connectingWallet === wallet.name;
            const showAsAvailable = isInstalled || isMobile; // On mobile, all are "available" via deep link
            
            return (
              <button
                key={wallet.name}
                onClick={() => handleConnect(wallet)}
                disabled={isConnecting}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isCurrentlyConnecting
                    ? "border-primary bg-primary/20"
                    : showAsAvailable 
                      ? "border-primary/30 hover:border-primary hover:bg-primary/10 cursor-pointer" 
                      : "border-border/50 opacity-60"
                }`}
              >
                <img 
                  src={wallet.icon} 
                  alt={wallet.name}
                  className="w-8 h-8 rounded-lg"
                />
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">{wallet.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isCurrentlyConnecting 
                      ? "Connecting..." 
                      : isMobile 
                        ? "Tap to open"
                        : isInstalled 
                          ? "Detected" 
                          : "Not installed"
                    }
                  </p>
                </div>
                {!isInstalled && !isMobile && (
                  <a
                    href={wallet.url}
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

        {!hasAnyWallet && !isMobile && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              No wallets detected. Install one of the wallets above to continue.
            </p>
          </div>
        )}

        {isMobile && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              Tap a wallet to open this page in the wallet's browser
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

  // Empty wallets array - we handle connection directly via window providers
  const wallets = useMemo(() => [], []);

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
