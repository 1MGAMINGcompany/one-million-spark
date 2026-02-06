import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Share2, Mail, MessageCircle, Facebook, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
import {
  buildInviteLink,
  shareInvite,
  whatsappInvite,
  facebookInvite,
  emailInvite,
  copyInviteLink,
} from "@/lib/invite";

interface ShareInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomPda: string;
  gameName?: string;
}

export function ShareInviteDialog({
  open,
  onOpenChange,
  roomPda,
  gameName,
}: ShareInviteDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { play } = useSound();
  const { t } = useTranslation();

  const inWalletBrowser = isWalletInAppBrowser();
  const inviteLink = buildInviteLink({ roomPda });

  const handleCopy = async () => {
    try {
      await copyInviteLink(inviteLink);
      setCopied(true);
      play("ui/click");
      toast({
        title: t("common.linkCopied"),
        description: t("common.linkCopiedDesc"),
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: t("common.failedToCopy"),
        description: t("common.copyManually"),
        variant: "destructive",
      });
    }
  };

  const handleNativeShare = async () => {
    try {
      await shareInvite(inviteLink, gameName);
      play("ui/click");
    } catch {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    play("ui/click");
    whatsappInvite(inviteLink, gameName);
  };

  const handleFacebook = () => {
    play("ui/click");
    facebookInvite(inviteLink);
  };

  const handleEmail = () => {
    play("ui/click");
    emailInvite(inviteLink, gameName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-primary/30 bg-background">
        <DialogHeader>
          <DialogTitle className="text-primary font-cinzel">
            {t("shareInvite.invitePlayers")}
          </DialogTitle>
          <DialogDescription>
            {t("shareInvite.sharePrivateRoom")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code */}
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG
                value={inviteLink}
                size={120}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("shareInvite.showQrToFriend", "Show this QR to a friend to scan")}
            </p>
          </div>

          {/* Copy Link Input */}
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={inviteLink}
              className="bg-muted/50 border-primary/20 text-sm"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={handleCopy}
              className="shrink-0 border-primary/30 hover:bg-primary/10"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {"share" in navigator && (
              <Button
                variant="outline"
                onClick={handleNativeShare}
                className="border-primary/30 hover:bg-primary/10 gap-2"
              >
                <Share2 className="h-4 w-4" />
                {t("shareInvite.share")}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={handleWhatsApp}
              className="border-green-500/50 hover:bg-green-500/10 text-green-500 gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>

            <Button
              variant="outline"
              onClick={handleFacebook}
              className="border-blue-500/50 hover:bg-blue-500/10 text-blue-500 gap-2"
            >
              <Facebook className="h-4 w-4" />
              Facebook
            </Button>

            {/* Hide Email in wallet in-app browsers (mailto: blocked) */}
            {!inWalletBrowser && (
              <Button
                variant="outline"
                onClick={handleEmail}
                className="border-primary/30 hover:bg-primary/10 gap-2"
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            {t("game.room")} #{roomPda.slice(0, 8)}... • {t("shareInvite.walletNeeded")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
