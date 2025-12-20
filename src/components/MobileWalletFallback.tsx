import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, QrCode, X, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

interface MobileWalletFallbackProps {
  onClose: () => void;
  isAndroid: boolean;
  isIOS: boolean;
}

export function MobileWalletFallback({ onClose, isAndroid, isIOS }: MobileWalletFallbackProps) {
  const [copiedSite, setCopiedSite] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const currentUrl = window.location.href;
  const siteUrl = "https://www.1mgaming.com";

  // Solflare deeplink for browsing
  const solflareDeeplink = `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(siteUrl)}`;

  const handleCopySite = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopiedSite(true);
      toast.success("Site link copied!");
      setTimeout(() => setCopiedSite(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCopyPage = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedPage(true);
      toast.success("Page link copied!");
      setTimeout(() => setCopiedPage(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleOpenSolflare = () => {
    window.location.href = solflareDeeplink;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Smartphone size={20} />
          Open in Wallet Browser
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Platform-specific guidance */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {isIOS 
              ? "iPhone browsers may not connect directly to wallets. Open this site inside your wallet's built-in browser for reliable connection."
              : "If your wallet didn't open automatically, use one of the options below to open this site in your wallet's browser."
            }
          </p>
        </div>

        {/* Solflare - One-tap deeplink */}
        <div className="bg-card rounded-lg p-4 border space-y-3">
          <div className="flex items-center gap-3">
            <img 
              src="https://raw.githubusercontent.com/nickreynolds/fotomatic/main/solflare.png" 
              alt="Solflare" 
              className="w-8 h-8 rounded-lg"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div>
              <h3 className="font-medium">Solflare</h3>
              <p className="text-xs text-muted-foreground">One-tap open</p>
            </div>
          </div>
          <Button 
            onClick={handleOpenSolflare}
            className="w-full gap-2"
            variant="default"
          >
            <ExternalLink size={16} />
            Open in Solflare
          </Button>
        </div>

        {/* Phantom - Manual instructions */}
        <div className="bg-card rounded-lg p-4 border space-y-3">
          <div className="flex items-center gap-3">
            <img 
              src="https://raw.githubusercontent.com/nickreynolds/fotomatic/main/phantom.png" 
              alt="Phantom" 
              className="w-8 h-8 rounded-lg"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div>
              <h3 className="font-medium">Phantom</h3>
              <p className="text-xs text-muted-foreground">Manual steps</p>
            </div>
          </div>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Open the <strong>Phantom</strong> app</li>
            <li>Tap the <strong>Explore</strong> tab (compass icon)</li>
            <li>Paste <code className="bg-muted px-1 rounded text-xs">1mgaming.com</code> in the search bar</li>
            <li>Tap <strong>Connect</strong> when prompted</li>
          </ol>
          <div className="flex gap-2">
            <Button 
              onClick={handleCopySite}
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
            >
              {copiedSite ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              Copy 1mgaming.com
            </Button>
            <Button 
              onClick={handleCopyPage}
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
            >
              {copiedPage ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              Copy page link
            </Button>
          </div>
        </div>

        {/* Backpack - Manual instructions */}
        <div className="bg-card rounded-lg p-4 border space-y-3">
          <div className="flex items-center gap-3">
            <img 
              src="https://raw.githubusercontent.com/nickreynolds/fotomatic/main/backpack.png" 
              alt="Backpack" 
              className="w-8 h-8 rounded-lg"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div>
              <h3 className="font-medium">Backpack</h3>
              <p className="text-xs text-muted-foreground">Manual steps</p>
            </div>
          </div>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Open the <strong>Backpack</strong> app</li>
            <li>Tap the <strong>Browser</strong> icon</li>
            <li>Navigate to <code className="bg-muted px-1 rounded text-xs">1mgaming.com</code></li>
            <li>Tap <strong>Connect</strong> when prompted</li>
          </ol>
        </div>

        {/* QR Code section */}
        <div className="bg-card rounded-lg p-4 border space-y-3">
          <Button 
            onClick={() => setShowQR(!showQR)}
            variant="outline"
            className="w-full gap-2"
          >
            <QrCode size={16} />
            {showQR ? "Hide QR Code" : "Show QR Code"}
          </Button>
          
          {showQR && (
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG 
                  value={currentUrl} 
                  size={180}
                  level="M"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Scan this QR code from your wallet app's browser
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button 
          onClick={onClose}
          variant="ghost"
          className="w-full"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
