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
import {
  buildInviteLink,
  shareInvite,
  whatsappInvite,
  facebookInvite,
  emailInvite,
  smsInvite,
  copyInviteLink,
  type RoomInviteInfo,
} from "@/lib/invite";

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
      await shareInvite(inviteLink, gameName, roomInfo);
      play("ui/click");
    } catch {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    play("ui/click");
    whatsappInvite(inviteLink, gameName, roomInfo);
  };

  const handleSMS = () => {
    play("ui/click");
    smsInvite(inviteLink, gameName, roomInfo);
  };

  const handleFacebook = () => {
    play("ui/click");
    facebookInvite(inviteLink);
  };

  const handleEmail = () => {
    play("ui/click");
    emailInvite(inviteLink, gameName, roomInfo);
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
              onClick={handleSMS}
              className="border-blue-400/50 hover:bg-blue-400/10 text-blue-400 gap-2"
            >
              <Smartphone className="h-4 w-4" />
              SMS
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
