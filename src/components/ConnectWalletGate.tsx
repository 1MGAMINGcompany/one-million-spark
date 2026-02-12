import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, Info } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";
import { WalletNotDetectedModal } from "./WalletNotDetectedModal";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

// Import local wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

// Environment detection
const getIsMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsAndroid = () => /Android/i.test(navigator.userAgent);
const getIsIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsInWalletBrowser = () => {
  const win = window as any;
  return !!win?.phantom?.solana?.isPhantom || !!win?.solflare?.isSolflare || !!win?.solana;
};

// Explicit wallet detection helpers
const isPhantomAvailable = () => {
  const win = window as any;
  return !!win?.solana?.isPhantom;
};

const isSolflareAvailable = () => {
  const win = window as any;
  return !!win?.solflare?.isSolflare;
};

const isBackpackAvailable = () => {
  const win = window as any;
  return !!win?.backpack?.isBackpack;
};

// Deep link helpers for opening dapp in wallet browser
const getWalletBrowseDeepLink = (walletType: 'phantom' | 'solflare', url: string): string => {
  const encodedUrl = encodeURIComponent(url);
  switch (walletType) {
    case 'phantom':
      return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodeURIComponent(url)}`;
    case 'solflare':
      return `https://solflare.com/ul/v1/browse/${encodedUrl}?redirect_link=${encodedUrl}`;
    default:
      return url;
  }
};

interface ConnectWalletGateProps {
  className?: string;
}

// Wallet icons - using local assets
const WALLET_CONFIG = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: phantomIcon,
  },
  {
    id: 'solflare', 
    name: 'Solflare',
    icon: solflareIcon,
  },
  {
    id: 'backpack',
    name: 'Backpack', 
    icon: backpackIcon,
  },
];

/**
 * A component to display when wallet connection is required.
 * Shows custom wallet picker with 3 buttons + icons.
 * On mobile: shows friendly helper text (non-blocking).
 */
export function ConnectWalletGate({ className }: ConnectWalletGateProps) {
  const { t } = useTranslation();
  const { wallets, select, connect, connecting, connected } = useWallet();
  const [showHelp, setShowHelp] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notDetectedWallet, setNotDetectedWallet] = useState<'phantom' | 'solflare' | 'backpack' | null>(null);
  
  const isMobile = getIsMobile();
  const isAndroid = getIsAndroid();
  const isIOS = getIsIOS();
  const isInWalletBrowser = getIsInWalletBrowser();

  // Auto-connect polling for wallet browser environments
  useEffect(() => {
    if (connected || connecting) return;
    if (!isMobile) return;

    let attempts = 0;
    const maxAttempts = 15; // 15 x 200ms = 3 seconds

    const interval = setInterval(() => {
      attempts++;
      const win = window as any;
      const hasProvider = win.solana || win.phantom?.solana || win.solflare;

      if (hasProvider) {
        clearInterval(interval);
        const installed = wallets.find(w => w.readyState === 'Installed');
        if (installed && !connected) {
          console.log("[WalletAutoConnect] Gate: Provider detected, connecting via", installed.adapter.name);
          select(installed.adapter.name);
          connect().catch(err => console.warn("[WalletAutoConnect] Gate: Failed:", err));
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if MWA is available (Android only)
  const hasMWA = isAndroid && wallets.some(w => 
    w.adapter.name.toLowerCase().includes('mobile wallet adapter')
  );

  // Handle MWA connect (Android)
  const handleMWAConnect = () => {
    const mwaWallet = wallets.find(w => 
      w.adapter.name.toLowerCase().includes('mobile wallet adapter')
    );
    if (mwaWallet) {
      select(mwaWallet.adapter.name);
      connect().catch(() => {}); // Explicit connect to trigger wallet handshake
      setDialogOpen(false);
    }
  };

  // Handle deep link to open dapp in wallet browser (iOS)
  const handleOpenInWallet = (walletType: 'phantom' | 'solflare') => {
    const deepLink = getWalletBrowseDeepLink(walletType, window.location.href);
    window.location.href = deepLink;
  };

  const handleSelectWallet = (walletId: string) => {
    // MOBILE REGULAR BROWSER: deep link is the only way to connect
    if (isMobile && !isInWalletBrowser) {
      const deepLink = getWalletBrowseDeepLink(
        walletId === 'backpack' ? 'phantom' : walletId as 'phantom' | 'solflare',
        window.location.href
      );
      // Backpack has its own deep link format
      if (walletId === 'backpack') {
        window.location.href = `https://backpack.app/ul/browse/${encodeURIComponent(window.location.href)}`;
      } else {
        window.location.href = deepLink;
      }
      setDialogOpen(false);
      return;
    }

    // DESKTOP or WALLET BROWSER: standard select()+connect() flow
    const matchingWallet = wallets.find(w => 
      w.adapter.name.toLowerCase().includes(walletId)
    );
    
    if (matchingWallet) {
      select(matchingWallet.adapter.name);
      connect().catch(() => {});
      setDialogOpen(false);
    } else {
      // Desktop: wallet not installed
      toast.error(t("wallet.walletNotDetected", { wallet: walletId }));
    }
  };

  const handleRetryCheck = () => {
    // Re-check if wallet is now available
    const checkFns: Record<string, () => boolean> = {
      phantom: isPhantomAvailable,
      solflare: isSolflareAvailable,
      backpack: isBackpackAvailable,
    };
    
    if (notDetectedWallet && checkFns[notDetectedWallet]?.()) {
      // Wallet now detected! Try to connect
      const walletId = notDetectedWallet;
      setNotDetectedWallet(null);
      handleSelectWallet(walletId);
    } else {
      toast.error(t("wallet.stillNotDetected"));
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
          {t("wallet.howToConnectSol")}
        </button>
      </div>

      {/* Custom Wallet Picker Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("wallet.connectWallet")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("wallet.selectProvider")}
            </DialogDescription>
          </DialogHeader>
          
        <div className="grid gap-3 py-4">
            
            {/* ANDROID: Show MWA as top option */}
            {isAndroid && hasMWA && (
              <Button
                variant="default"
                className="w-full justify-start gap-3 h-14 bg-primary"
                onClick={handleMWAConnect}
              >
                <Wallet size={24} />
                <div className="flex flex-col items-start">
                  <span className="font-medium">{t("wallet.useInstalledWallet")}</span>
                  <span className="text-xs opacity-80">{t("wallet.mwaSubtitle")}</span>
                </div>
              </Button>
            )}

            {/* Wallet buttons — shown on ALL platforms */}
            {WALLET_CONFIG.map((wallet) => {
              const detected = isWalletDetected(wallet.id);
              const showDeepLinkLabel = isMobile && !isInWalletBrowser;
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
                    <span className="font-medium">
                      {showDeepLinkLabel ? t("wallet.openInWallet", { wallet: wallet.name }) : wallet.name}
                    </span>
                    {detected && (
                      <span className="text-xs text-green-500">{t("wallet.detected")}</span>
                    )}
                    {showDeepLinkLabel && (
                      <span className="text-xs text-muted-foreground">{t("wallet.opensWalletBrowser")}</span>
                    )}
                  </div>
                </Button>
              );
            })}

            {/* In wallet browser success */}
            {isMobile && isInWalletBrowser && (
              <p className="text-xs text-green-500 text-center mt-2 bg-green-500/10 p-2 rounded">
                ✓ {t("wallet.inWalletBrowser")}
              </p>
            )}

            {/* MWA note for Android */}
            {isAndroid && !isInWalletBrowser && hasMWA && (
              <p className="text-xs text-muted-foreground text-center mt-1">
                {t("wallet.mwaNote")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Not Detected Modal */}
      <WalletNotDetectedModal
        open={!!notDetectedWallet}
        onOpenChange={(open) => !open && setNotDetectedWallet(null)}
        walletType={notDetectedWallet || 'phantom'}
        onRetryCheck={handleRetryCheck}
      />

      <HowToConnectSolModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </div>
  );
}
