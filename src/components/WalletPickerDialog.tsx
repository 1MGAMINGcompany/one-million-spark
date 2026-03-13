import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { WalletNotDetectedModal } from "./WalletNotDetectedModal";

import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

const getIsMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsAndroid = () => /Android/i.test(navigator.userAgent);
const getIsInWalletBrowser = () => {
  const win = window as any;
  return !!win?.phantom?.solana?.isPhantom || !!win?.solflare?.isSolflare || !!win?.solana;
};

const isPhantomAvailable = () => !!(window as any)?.solana?.isPhantom;
const isSolflareAvailable = () => !!(window as any)?.solflare?.isSolflare;
const isBackpackAvailable = () => !!(window as any)?.backpack?.isBackpack;

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

const WALLET_CONFIG = [
  { id: 'phantom', name: 'Phantom', icon: phantomIcon },
  { id: 'solflare', name: 'Solflare', icon: solflareIcon },
  { id: 'backpack', name: 'Backpack', icon: backpackIcon },
];

interface WalletPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WalletPickerDialog({ open, onOpenChange }: WalletPickerDialogProps) {
  const { t } = useTranslation();
  const { wallets, select, connect } = useWallet();
  const [notDetectedWallet, setNotDetectedWallet] = useState<'phantom' | 'solflare' | 'backpack' | null>(null);

  const isMobile = getIsMobile();
  const isAndroid = getIsAndroid();
  const isInWalletBrowser = getIsInWalletBrowser();

  const hasMWA = isAndroid && wallets.some(w =>
    w.adapter.name.toLowerCase().includes('mobile wallet adapter')
  );

  const handleMWAConnect = () => {
    const mwaWallet = wallets.find(w =>
      w.adapter.name.toLowerCase().includes('mobile wallet adapter')
    );
    if (mwaWallet) {
      select(mwaWallet.adapter.name);
      connect().catch(() => {});
      onOpenChange(false);
    }
  };

  const handleSelectWallet = (walletId: string) => {
    if (isMobile && !isInWalletBrowser) {
      if (walletId === 'backpack') {
        window.location.href = `https://backpack.app/ul/browse/${encodeURIComponent(window.location.href)}`;
      } else {
        window.location.href = getWalletBrowseDeepLink(walletId as 'phantom' | 'solflare', window.location.href);
      }
      onOpenChange(false);
      return;
    }

    const matchingWallet = wallets.find(w =>
      w.adapter.name.toLowerCase().includes(walletId)
    );

    if (matchingWallet) {
      select(matchingWallet.adapter.name);
      connect().catch(() => {});
      onOpenChange(false);
    } else {
      toast.error(t("wallet.walletNotDetected", { wallet: walletId }));
    }
  };

  const handleRetryCheck = () => {
    const checkFns: Record<string, () => boolean> = {
      phantom: isPhantomAvailable,
      solflare: isSolflareAvailable,
      backpack: isBackpackAvailable,
    };
    if (notDetectedWallet && checkFns[notDetectedWallet]?.()) {
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("wallet.connectWallet")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("wallet.selectProvider")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
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
                  <img src={wallet.icon} alt={wallet.name} className="w-8 h-8" />
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

            {isMobile && isInWalletBrowser && (
              <p className="text-xs text-green-500 text-center mt-2 bg-green-500/10 p-2 rounded">
                ✓ {t("wallet.inWalletBrowser")}
              </p>
            )}

            {isAndroid && !isInWalletBrowser && hasMWA && (
              <p className="text-xs text-muted-foreground text-center mt-1">
                {t("wallet.mwaNote")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <WalletNotDetectedModal
        open={!!notDetectedWallet}
        onOpenChange={(o) => !o && setNotDetectedWallet(null)}
        walletType={notDetectedWallet || 'phantom'}
        onRetryCheck={handleRetryCheck}
      />
    </>
  );
}
