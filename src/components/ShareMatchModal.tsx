import { useState } from "react";
import { Copy, Check, ExternalLink, MessageCircle, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
import {
  buildMatchShareUrl,
  buildWhatsAppShareUrl,
  buildTwitterShareUrl,
  copyMatchLink,
  nativeShare,
  isNativeShareAvailable,
  getGameDisplayName,
} from "@/lib/shareMatch";

interface ShareMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomPda: string;
  isWinner: boolean;
  gameName: string;
}

export function ShareMatchModal({ open, onOpenChange, roomPda, isWinner, gameName }: ShareMatchModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const inWalletBrowser = isWalletInAppBrowser();

  const matchUrl = buildMatchShareUrl(roomPda);
  const gameDisplayName = getGameDisplayName(gameName);

  const handleCopy = async () => {
    const success = await copyMatchLink(roomPda);
    if (success) {
      setCopied(true);
      toast.success(t("shareMatch.linkCopied", "Link copied!"));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy link");
    }
  };

  const handleWhatsApp = () => {
    const url = buildWhatsAppShareUrl(roomPda, isWinner, gameDisplayName);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleTwitter = () => {
    const url = buildTwitterShareUrl(roomPda, isWinner, gameDisplayName);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    const success = await nativeShare(roomPda, isWinner, gameDisplayName);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            {isWinner 
              ? t("shareMatch.shareWin", "Share Win") 
              : t("shareMatch.shareMatch", "Share Match")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview message */}
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {isWinner 
                ? `🏆 Share your ${gameDisplayName} victory!` 
                : `🎮 Share this ${gameDisplayName} match result`}
            </p>
          </div>

          {/* Link preview */}
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-3">
            <input
              type="text"
              value={matchUrl}
              readOnly
              className="flex-1 bg-transparent text-sm font-mono text-muted-foreground outline-none"
            />
          </div>

          {/* Share buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* Copy Link */}
            <Button
              onClick={handleCopy}
              variant="outline"
              className="gap-2 h-12"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {t("shareMatch.copyLink", "Copy Link")}
            </Button>

            {/* WhatsApp - hidden in wallet browsers */}
            {!inWalletBrowser && (
              <Button
                onClick={handleWhatsApp}
                className="gap-2 h-12 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </Button>
            )}

            {/* Twitter/X */}
            <Button
              onClick={handleTwitter}
              variant="outline"
              className="gap-2 h-12"
            >
              <ExternalLink className="w-4 h-4" />
              Twitter/X
            </Button>

            {/* Native Share (if available) */}
            {isNativeShareAvailable() && (
              <Button
                onClick={handleNativeShare}
                variant="outline"
                className="gap-2 h-12"
              >
                <Share2 className="w-4 h-4" />
                More...
              </Button>
            )}
          </div>

          {/* View match page link */}
          <a
            href={matchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-primary hover:text-primary/80 transition-colors"
          >
            {t("shareMatch.matchDetails", "View Match Details")} →
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
