import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Import local wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

type WalletType = "phantom" | "solflare" | "backpack";

interface MobileWalletFallbackProps {
  onClose: () => void;
  isAndroid: boolean;
  isIOS: boolean;
  selectedWallet: WalletType;
}

export function MobileWalletFallback({ onClose, isAndroid, isIOS, selectedWallet }: MobileWalletFallbackProps) {
  const { t } = useTranslation();
  const [copiedSite, setCopiedSite] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);

  const currentUrl = window.location.href;
  const siteUrl = "https://www.1mgaming.com";

  const solflareDeeplink = `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(siteUrl)}`;

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

  const handleOpenSolflare = () => {
    window.location.href = solflareDeeplink;
  };

  const renderPhantomInstructions = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img 
          src={phantomIcon} 
          alt="Phantom" 
          className="w-10 h-10 rounded-lg"
        />
        <div>
          <h3 className="font-semibold text-lg">{t("wallet.phantom.title")}</h3>
        </div>
      </div>
      
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium">1</span>
          <span>{t("wallet.phantom.step1")}</span>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium">2</span>
          <span>{t("wallet.phantom.step2")}</span>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium">3</span>
          <span>{t("wallet.phantom.step3")}</span>
        </li>
      </ol>

      <div className="flex flex-col gap-2 pt-2">
        <Button 
          onClick={handleCopyPage}
          variant="default"
          className="w-full gap-2"
        >
          {copiedPage ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          {copiedPage ? t("wallet.copied") : t("wallet.copyLink")}
        </Button>
        <Button 
          onClick={handleCopySite}
          variant="outline"
          className="w-full gap-2"
        >
          {copiedSite ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          {copiedSite ? t("wallet.copied") : t("wallet.copySite")}
        </Button>
      </div>
    </div>
  );

  const renderSolflareInstructions = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img 
          src={solflareIcon} 
          alt="Solflare" 
          className="w-10 h-10 rounded-lg"
        />
        <div>
          <h3 className="font-semibold text-lg">{t("wallet.solflare.title")}</h3>
        </div>
      </div>

      <Button 
        onClick={handleOpenSolflare}
        className="w-full gap-2"
        size="lg"
      >
        <ExternalLink size={18} />
        {t("wallet.solflare.openButton")}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        {t("wallet.solflare.note")}
      </p>
    </div>
  );

  const renderBackpackInstructions = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img 
          src={backpackIcon} 
          alt="Backpack" 
          className="w-10 h-10 rounded-lg"
        />
        <div>
          <h3 className="font-semibold text-lg">{t("wallet.backpack.title")}</h3>
        </div>
      </div>
      
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium">1</span>
          <span>{t("wallet.backpack.step1")}</span>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium">2</span>
          <span>{t("wallet.backpack.step2")}</span>
        </li>
      </ol>

      <div className="flex flex-col gap-2 pt-2">
        <Button 
          onClick={handleCopyPage}
          variant="default"
          className="w-full gap-2"
        >
          {copiedPage ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          {copiedPage ? t("wallet.copied") : t("wallet.copyLink")}
        </Button>
        <Button 
          onClick={handleCopySite}
          variant="outline"
          className="w-full gap-2"
        >
          {copiedSite ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          {copiedSite ? t("wallet.copied") : t("wallet.copySite")}
        </Button>
      </div>
    </div>
  );

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
        <div className="max-w-sm mx-auto">
          {/* Platform hint */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {isIOS ? t("wallet.mobileBrowserLimitation") : t("wallet.wrongWalletBrowserHint")}
            </p>
          </div>

          {/* Wallet-specific instructions */}
          <div className="bg-card rounded-xl p-5 border">
            {selectedWallet === "phantom" && renderPhantomInstructions()}
            {selectedWallet === "solflare" && renderSolflareInstructions()}
            {selectedWallet === "backpack" && renderBackpackInstructions()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button 
          onClick={onClose}
          variant="ghost"
          className="w-full"
        >
          {t("wallet.cancel")}
        </Button>
      </div>
    </div>
  );
}
