import { ReactNode, useMemo, useCallback, useState, createContext, useContext } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { clusterApiUrl } from "@solana/web3.js";
import { WalletReadyState } from "@solana/wallet-adapter-base";

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
  const { wallets, select, connecting } = useWallet();

  // Filter to ONLY our explicitly defined Solana wallets
  const allowedWalletNames = ["Phantom", "Solflare", "Backpack"];
  
  const filteredWallets = useMemo(() => {
    return wallets.filter(wallet => 
      allowedWalletNames.some(name => 
        wallet.adapter.name.toLowerCase().includes(name.toLowerCase())
      )
    );
  }, [wallets]);

  const handleSelect = useCallback((walletName: string) => {
    select(walletName as any);
    setVisible(false);
  }, [select, setVisible]);

  if (!visible) return null;

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

        <p className="text-xs text-muted-foreground text-center mt-4">
          Solana wallets only. No EVM wallets.
        </p>
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
  // Solana Mainnet-Beta endpoint
  const endpoint = useMemo(() => clusterApiUrl("mainnet-beta"), []);

  // ONLY these Solana wallets - NO auto-detection, NO EVM wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <CustomWalletModalProvider>
          {children}
        </CustomWalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
