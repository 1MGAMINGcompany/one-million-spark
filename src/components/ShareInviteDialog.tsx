import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Share2, Mail, MessageCircle, Facebook, Check, Smartphone, Users, Coins, Timer, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useWallet } from "@/hooks/useWallet";
import { SendToWalletInput } from "@/components/SendToWalletInput";
import { QRCodeSVG } from "qrcode.react";
import {
  buildInviteLink,
  shareInvite,
  whatsappInvite,
  facebookInvite,
  emailInvite,
  smsInvite,
  twitterInvite,
  telegramInvite,
  copyInviteLink,
  type RoomInviteInfo,
} from "@/lib/invite";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

// Twitter/X icon (not in lucide)
const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// Telegram icon
const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

interface ShareInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  gameName?: string;
  // Rich room info for enhanced sharing
  stakeSol?: number;
  winnerPayout?: number;
  turnTimeSeconds?: number;
  maxPlayers?: number;
  playerCount?: number;
  mode?: 'casual' | 'ranked' | 'private';
}

export function ShareInviteDialog({
  open,
  onOpenChange,
  roomId,
  gameName,
  stakeSol = 0,
  winnerPayout = 0,
  turnTimeSeconds = 0,
  maxPlayers = 2,
  playerCount = 1,
  mode = 'casual',
}: ShareInviteDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { play } = useSound();
  const { t } = useTranslation();
  const { address } = useWallet();
  
  // Detect mobile for UX prioritization
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const inviteLink = buildInviteLink({ roomId });
  
  // Build room info for rich sharing
  const roomInfo: RoomInviteInfo = {
    roomPda: roomId,
    gameName,
    stakeSol,
    winnerPayout,
    turnTimeSeconds,
    maxPlayers,
    playerCount,
    mode,
  };

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
      play("ui/click");
      const success = await shareInvite(inviteLink, gameName, roomInfo);
      if (!success) {
        handleCopy();
      }
    } catch {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    play("ui/click");
    const success = whatsappInvite(inviteLink, gameName, roomInfo);
    if (!success) {
      handleCopy();
      toast({
        title: "Link copied!",
        description: isWalletInAppBrowser() 
          ? "Paste it into WhatsApp / Messages."
          : t("shareInvite.linkCopiedInstead", "Link copied to clipboard instead"),
      });
    }
  };

  const handleSMS = () => {
    play("ui/click");
    const success = smsInvite(inviteLink, gameName, roomInfo);
    if (!success) {
      handleCopy();
      toast({
        title: "Link copied!",
        description: isWalletInAppBrowser() 
          ? "Paste it into Messages / SMS app."
          : t("shareInvite.linkCopiedInstead", "Link copied to clipboard instead"),
      });
    }
  };

  const handleFacebook = () => {
    play("ui/click");
    const success = facebookInvite(inviteLink);
    if (!success) {
      handleCopy();
      toast({
        title: t("shareInvite.openFailed", "Couldn't open Facebook"),
        description: t("shareInvite.linkCopiedInstead", "Link copied to clipboard instead"),
      });
    }
  };

  const handleEmail = () => {
    play("ui/click");
    const success = emailInvite(inviteLink, gameName, roomInfo);
    if (!success) {
      handleCopy();
      toast({
        title: "Link copied!",
        description: isWalletInAppBrowser() 
          ? "Paste it into your email app."
          : t("shareInvite.linkCopiedInstead", "Link copied to clipboard instead"),
      });
    }
  };

  const handleTwitter = () => {
    play("ui/click");
    const success = twitterInvite(inviteLink, gameName, roomInfo);
    if (!success) {
      handleCopy();
      toast({
        title: t("shareInvite.openFailed", "Couldn't open Twitter/X"),
        description: t("shareInvite.linkCopiedInstead", "Link copied to clipboard instead"),
      });
    }
  };

  const handleTelegram = () => {
    play("ui/click");
    const success = telegramInvite(inviteLink, gameName, roomInfo);
    if (!success) {
      handleCopy();
      toast({
        title: t("shareInvite.openFailed", "Couldn't open Telegram"),
        description: t("shareInvite.linkCopiedInstead", "Link copied to clipboard instead"),
      });
    }
  };

  // Format turn time for display
  const formatTurnTime = (seconds: number): string => {
    if (seconds <= 0) return t("createRoom.unlimited", "Unlimited");
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
    return `${seconds}s`;
  };

  // Mode badge styling
  const getModeStyles = () => {
    switch (mode) {
      case 'ranked':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'private':
        return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    }
  };

  const getModeEmoji = () => {
    switch (mode) {
      case 'ranked': return '🔴';
      case 'private': return '🟣';
      default: return '🟢';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-primary/30 bg-background">
        <DialogHeader>
          <DialogTitle className="text-primary font-cinzel flex items-center gap-2">
            {mode === 'private' && <span>🔒</span>}
            {t("shareInvite.invitePlayers")}
          </DialogTitle>
          <DialogDescription>
            {mode === 'private' 
              ? t("shareInvite.sharePrivateRoomDesc", "Share this link with friends to invite them to your private game!")
              : t("shareInvite.sharePrivateRoom")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Room Info Card */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{gameName || 'Game'}</span>
              <span className={`text-xs px-2 py-1 rounded-full border ${getModeStyles()}`}>
                {getModeEmoji()} {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              {/* Stake */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Coins className="h-4 w-4" />
                <span>Stake:</span>
                <span className="text-foreground font-medium">
                  {stakeSol > 0 ? `${stakeSol.toFixed(4)} SOL` : 'Free'}
                </span>
              </div>
              
              {/* Winner Gets */}
              {winnerPayout > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span>Win:</span>
                  <span className="text-emerald-400 font-medium">
                    {winnerPayout.toFixed(4)} SOL
                  </span>
                </div>
              )}
              
              {/* Players */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>Players:</span>
                <span className="text-foreground font-medium">
                  {playerCount}/{maxPlayers}
                </span>
              </div>
              
              {/* Turn Time */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="h-4 w-4" />
                <span>Turn:</span>
                <span className="text-foreground font-medium">
                  {formatTurnTime(turnTimeSeconds)}
                </span>
              </div>
            </div>
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
          {/* Mobile: Native share as primary action */}
          {isMobile && hasNativeShare && (
            <Button
              variant="default"
              onClick={handleNativeShare}
              className="w-full gap-2 mb-3"
            >
              <Share2 className="h-4 w-4" />
              {t("shareInvite.shareInvite", "Share invite")}
            </Button>
          )}

          {/* Share Buttons Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Desktop: Show native share in grid */}
            {!isMobile && hasNativeShare && (
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
              onClick={handleSMS}
              className="border-blue-400/50 hover:bg-blue-400/10 text-blue-400 gap-2"
            >
              <Smartphone className="h-4 w-4" />
              SMS
            </Button>

            <Button
              variant="outline"
              onClick={handleTelegram}
              className="border-sky-400/50 hover:bg-sky-400/10 text-sky-400 gap-2"
            >
              <TelegramIcon />
              Telegram
            </Button>

            <Button
              variant="outline"
              onClick={handleTwitter}
              className="border-slate-400/50 hover:bg-slate-400/10 text-slate-300 gap-2"
            >
              <TwitterIcon />
              X / Twitter
            </Button>

            <Button
              variant="outline"
              onClick={handleFacebook}
              className="border-blue-500/50 hover:bg-blue-500/10 text-blue-500 gap-2"
            >
              <Facebook className="h-4 w-4" />
              Facebook
            </Button>

            <Button
              variant="outline"
              onClick={handleEmail}
              className="border-primary/30 hover:bg-primary/10 gap-2 col-span-2"
            >
              <Mail className="h-4 w-4" />
              {t("shareInvite.email", "Email")}
            </Button>
          </div>

          {/* QR Code for Desktop -> Mobile sharing */}
          {!isMobile && (
            <>
              <Separator className="my-2" />
              <div className="flex flex-col items-center py-3">
                <p className="text-xs text-muted-foreground mb-3">
                  {t("shareInvite.scanToJoin", "Scan with phone to join")}
                </p>
                <div className="bg-white p-3 rounded-lg">
                  <QRCodeSVG value={inviteLink} size={120} />
                </div>
              </div>
            </>
          )}

          {/* Send to Wallet Section */}
          <Separator className="my-2" />
          
          {address && (
            <SendToWalletInput 
              senderWallet={address} 
              roomInfo={roomInfo} 
            />
          )}

          <p className="text-xs text-muted-foreground text-center">
            {t("game.room")} #{roomId.slice(0, 8)}... • {t("shareInvite.walletNeeded")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
