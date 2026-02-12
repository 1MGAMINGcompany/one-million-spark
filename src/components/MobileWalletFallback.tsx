import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, X, ArrowLeft, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useWallet } from "@solana/wallet-adapter-react";

// Import local wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

type WalletType = "phantom" | "solflare" | "backpack";

interface MobileWalletFallbackProps {
  onClose: () => void;
  isAndroid: boolean;
  isIOS: boolean;
  selectedWallet: WalletType | null;
}

export function MobileWalletFallback({ onClose, isAndroid, isIOS, selectedWallet }: MobileWalletFallbackProps) {
  const { t } = useTranslation();
  const { wallets, select, connect } = useWallet();
  const [copiedSite, setCopiedSite] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);
  const [connectingNow, setConnectingNow] = useState(false);

  const currentUrl = window.location.href;
  const siteUrl = "https://www.1mgaming.com";

  const handleConnectNow = async () => {
    setConnectingNow(true);
    try {
      // Try to find an installed wallet and connect directly
      const installed = wallets.find(w => w.readyState === 'Installed');
      if (installed) {
        select(installed.adapter.name);
        await connect();
        onClose();
        return;
      }
      // Fallback: try MWA on Android
      if (isAndroid) {
        const mwa = wallets.find(w => w.adapter.name.toLowerCase().includes('mobile wallet adapter'));
        if (mwa) {
          select(mwa.adapter.name);
          await connect();
          onClose();
          return;
        }
      }
      toast.error(t("wallet.stillNotDetected"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setConnectingNow(false);
    }
  };

  const handleCopySite = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopiedSite(true);
      toast.success(t("wallet.copied"));
      setTimeout(() => setCopiedSite(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleCopyPage = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedPage(true);
      toast.success(t("wallet.copied"));
      setTimeout(() => setCopiedPage(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const walletConfig: Record<WalletType, { icon: string; name: string }> = {
    phantom: { icon: phantomIcon, name: "Phantom" },
    solflare: { icon: solflareIcon, name: "Solflare" },
    backpack: { icon: backpackIcon, name: "Backpack" },
  };

  const activeWallet = selectedWallet ? walletConfig[selectedWallet] : walletConfig.phantom;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <button onClick={onClose} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={20} />
          <span>{t("wallet.back")}</span>
        </button>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-sm mx-auto space-y-4">
          {/* Connect Now - primary action */}
          <div className="bg-card rounded-xl p-5 border space-y-4">
            <div className="flex items-center gap-3">
              <img src={activeWallet.icon} alt={activeWallet.name} className="w-10 h-10 rounded-lg" />
              <div>
                <h3 className="font-semibold text-lg">{activeWallet.name}</h3>
              </div>
            </div>

            <Button
              onClick={handleConnectNow}
              className="w-full gap-2"
              size="lg"
              disabled={connectingNow}
            >
              <Wallet size={18} />
              {connectingNow ? t("wallet.connecting") : "Connect Now"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Tap above to retry the wallet connection directly.
            </p>
          </div>

          {/* Alternative: open in wallet browser */}
          <div className="bg-card rounded-xl p-5 border space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Alternative: Open in wallet browser</p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  const deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(siteUrl)}`;
                  window.location.href = deepLink;
                }}
                variant="outline"
                className="w-full gap-2"
              >
                <img src={phantomIcon} alt="Phantom" className="w-5 h-5" />
                <ExternalLink size={14} />
                Open in Phantom
              </Button>
              <Button
                onClick={() => {
                  const deepLink = `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(siteUrl)}`;
                  window.location.href = deepLink;
                }}
                variant="outline"
                className="w-full gap-2"
              >
                <img src={solflareIcon} alt="Solflare" className="w-5 h-5" />
                <ExternalLink size={14} />
                Open in Solflare
              </Button>
            </div>
          </div>

          {/* Copy links */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleCopyPage} variant="ghost" className="w-full gap-2 text-xs">
              {copiedPage ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiedPage ? t("wallet.copied") : t("wallet.copyLink")}
            </Button>
            <Button onClick={handleCopySite} variant="ghost" className="w-full gap-2 text-xs">
              {copiedSite ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiedSite ? t("wallet.copied") : t("wallet.copySite")}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button onClick={onClose} variant="ghost" className="w-full">
          {t("wallet.cancel")}
        </Button>
      </div>
    </div>
  );
}
