import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, Info, Smartphone, Globe } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

// Environment detection
const getIsMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsInWalletBrowser = () => {
  const win = window as any;
  return !!win?.phantom?.solana?.isPhantom || !!win?.solflare?.isSolflare || !!win?.solana;
};

interface ConnectWalletGateProps {
  className?: string;
}

// Wallet icons
const WALLET_CONFIG = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg',
    deepLinkBase: 'https://phantom.app/ul/browse/',
  },
  {
    id: 'solflare', 
    name: 'Solflare',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg',
    deepLinkBase: 'https://solflare.com/ul/v1/browse/',
  },
  {
    id: 'backpack',
    name: 'Backpack', 
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg',
    deepLinkBase: 'https://backpack.app/ul/browse/',
  },
];

/**
 * A component to display when wallet connection is required.
 * Shows custom wallet picker with 3 buttons + icons.
 * On mobile: shows helper text and globe images for wallet browser.
 */
export function ConnectWalletGate({ className }: ConnectWalletGateProps) {
  const { t } = useTranslation();
  const { wallets, select, connecting } = useWallet();
  const [showHelp, setShowHelp] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const isMobile = getIsMobile();
  const isInWalletBrowser = getIsInWalletBrowser();

  const handleSelectWallet = (walletId: string) => {
    // Find matching wallet from detected wallets
    const matchingWallet = wallets.find(w => 
      w.adapter.name.toLowerCase().includes(walletId)
    );
    
    if (matchingWallet) {
      select(matchingWallet.adapter.name);
      setDialogOpen(false);
    } else if (isMobile && !isInWalletBrowser) {
      // On mobile outside wallet browser, open deep link
      const walletConfig = WALLET_CONFIG.find(w => w.id === walletId);
      if (walletConfig) {
        const currentUrl = encodeURIComponent(window.location.href);
        const deepLink = `${walletConfig.deepLinkBase}${currentUrl}`;
        window.location.href = deepLink;
      }
    } else {
      toast.error(`${walletId} wallet not detected. Please install it first.`);
    }
  };

  const isWalletDetected = (walletId: string) => {
    return wallets.some(w => 
      w.adapter.name.toLowerCase().includes(walletId) && 
      w.readyState === 'Installed'
    );
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Primary Connect Button */}
        <Button 
          onClick={() => setDialogOpen(true)}
          className="w-full"
          size="lg"
          disabled={connecting}
        >
          <Wallet className="mr-2" size={18} />
          {connecting ? t("wallet.connecting") : t("wallet.connect")}
        </Button>

        {/* How to Connect Link */}
        <button
          onClick={() => setShowHelp(true)}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Info size={14} />
          How to connect & get SOL
        </button>
      </div>

      {/* Custom Wallet Picker Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("wallet.connectWallet")}</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-3 py-4">
            {/* Mobile helper text */}
            {isMobile && !isInWalletBrowser && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-2">
                <div className="flex items-start gap-2">
                  <Smartphone size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    For best experience, open this site inside your wallet's built-in browser (Phantom/Solflare/Backpack).
                  </p>
                </div>
              </div>
            )}

            {/* Wallet buttons with icons */}
            {WALLET_CONFIG.map((wallet) => {
              const detected = isWalletDetected(wallet.id);
              return (
                <Button
                  key={wallet.id}
                  variant="outline"
                  className="w-full justify-start gap-3 h-14"
                  onClick={() => handleSelectWallet(wallet.id)}
                >
                  <img 
                    src={wallet.icon} 
                    alt={wallet.name} 
                    className="w-8 h-8"
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{wallet.name}</span>
                    {detected && (
                      <span className="text-xs text-green-500">{t("wallet.detected")}</span>
                    )}
                    {isMobile && !isInWalletBrowser && !detected && (
                      <span className="text-xs text-muted-foreground">{t("wallet.openInWalletBrowser")}</span>
                    )}
                  </div>
                </Button>
              );
            })}

            {/* Mobile: How to open in wallet browser with globe images */}
            {isMobile && !isInWalletBrowser && (
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Globe size={16} className="text-primary" />
                  How to open in wallet browser
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {/* Phantom */}
                  <div className="flex flex-col items-center gap-2 p-2 rounded-lg bg-muted/30">
                    <img 
                      src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg" 
                      alt="Phantom" 
                      className="w-8 h-8"
                    />
                    <span className="text-xs font-medium">Phantom</span>
                    <div className="w-full h-16 bg-muted/50 rounded flex items-center justify-center">
                      <div className="text-center">
                        <Globe size={20} className="mx-auto text-primary mb-1" />
                        <span className="text-[10px] text-muted-foreground">Tap globe icon</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Solflare */}
                  <div className="flex flex-col items-center gap-2 p-2 rounded-lg bg-muted/30">
                    <img 
                      src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg" 
                      alt="Solflare" 
                      className="w-8 h-8"
                    />
                    <span className="text-xs font-medium">Solflare</span>
                    <div className="w-full h-16 bg-muted/50 rounded flex items-center justify-center">
                      <div className="text-center">
                        <Globe size={20} className="mx-auto text-primary mb-1" />
                        <span className="text-[10px] text-muted-foreground">Browser tab</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Backpack */}
                  <div className="flex flex-col items-center gap-2 p-2 rounded-lg bg-muted/30">
                    <img 
                      src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg" 
                      alt="Backpack" 
                      className="w-8 h-8"
                    />
                    <span className="text-xs font-medium">Backpack</span>
                    <div className="w-full h-16 bg-muted/50 rounded flex items-center justify-center">
                      <div className="text-center">
                        <Globe size={20} className="mx-auto text-primary mb-1" />
                        <span className="text-[10px] text-muted-foreground">Tap globe</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Open the wallet app → tap the globe/browser icon → paste 1mgaming.com
                </p>
              </div>
            )}

            {/* In wallet browser success */}
            {isMobile && isInWalletBrowser && (
              <p className="text-xs text-green-500 text-center mt-2 bg-green-500/10 p-2 rounded">
                ✓ {t("wallet.inWalletBrowser")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <HowToConnectSolModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </div>
  );
}
