import React, { ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
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

// Custom wallet modal - ONLY shows Phantom, Solflare, Backpack
function CustomWalletModal() {
  const { visible, setVisible } = useWalletModal();
  const { wallets, select, connect, connected, connecting, wallet } = useWallet();
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);

  // Filter to ONLY our explicitly defined Solana wallets
  const allowedWalletNames = ["Phantom", "Solflare", "Backpack"];
  
  const filteredWallets = useMemo(() => {
    return wallets.filter(w => 
      allowedWalletNames.some(name => 
        w.adapter.name.toLowerCase().includes(name.toLowerCase())
      )
    );
  }, [wallets]);

  // When wallet is selected and adapter is ready, call connect
  useEffect(() => {
    console.log("useEffect check - pendingWallet:", pendingWallet, "wallet?.adapter.name:", wallet?.adapter.name);
    if (pendingWallet && wallet?.adapter.name === pendingWallet) {
      console.log("Calling connect()...");
      connect().then(() => {
        console.log("connect() resolved");
      }).catch(err => {
        console.error("Connect error:", err);
      });
      setPendingWallet(null);
    }
  }, [pendingWallet, wallet, connect]);

  // Close modal when connected
  useEffect(() => {
    if (connected && visible) {
      setVisible(false);
    }
  }, [connected, visible, setVisible]);

  const handleSelect = useCallback((walletName: string) => {
    console.log("handleSelect called with:", walletName);
    console.log("Current wallets:", wallets.map(w => w.adapter.name));
    setPendingWallet(walletName);
    select(walletName as any);
    console.log("select() called");
  }, [select, wallets]);

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

        <div className="space-y-2">
          {filteredWallets.map((wallet) => {
            const isInstalled = wallet.readyState === WalletReadyState.Installed || 
                               wallet.readyState === WalletReadyState.Loadable;
            
            return (
              <button
                key={wallet.adapter.name}
                onClick={() => handleSelect(wallet.adapter.name)}
                disabled={connecting}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isInstalled 
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
                    {isInstalled ? "Detected" : "Not installed"}
                  </p>
                </div>
                {!isInstalled && (
                  <a
                    href={wallet.adapter.url}
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
  // Get endpoint from config (mainnet-beta or devnet)
  const endpoint = useMemo(() => getSolanaEndpoint(), []);

  // ONLY Solana wallets - Phantom, Solflare, Backpack
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  // Handle wallet errors gracefully
  const onError = useCallback((error: Error) => {
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
