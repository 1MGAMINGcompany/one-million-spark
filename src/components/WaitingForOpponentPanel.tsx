import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Check, Clock, Copy, CheckCheck, Users, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface WaitingForOpponentPanelProps {
  onLeave: () => void;
  roomPda?: string;
  /** Opponent wallet address for display */
  opponentWallet?: string;
  /** What we're waiting for: "join" (default) or "rules" (acceptance) */
  waitingFor?: "join" | "rules";
}

/** Format wallet address to short form: first 4...last 4 */
const shortWallet = (wallet?: string) => {
  if (!wallet) return "...";
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
};

/** Format room PDA to short form */
const shortRoom = (roomPda?: string) => {
  if (!roomPda) return "...";
  return roomPda.slice(0, 8);
};

export function WaitingForOpponentPanel({ 
  onLeave, 
  roomPda,
  opponentWallet,
  waitingFor = "join",
}: WaitingForOpponentPanelProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopyLink = async () => {
    const inviteUrl = roomPda 
      ? `${window.location.origin}/room/${roomPda}`
      : window.location.href;
    
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success(t("waitingPanel.linkCopiedToast"));
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(t("common.failedToCopy"));
    }
  };

  const isWaitingForRules = waitingFor === "rules";

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl p-6 text-center space-y-5 max-w-sm w-full shadow-lg">
        {/* Status Icon with Spinner */}
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center relative">
            <Users className="h-8 w-8 text-primary" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-20 w-20 text-primary/30 animate-spin" />
            </div>
          </div>
        </div>

        {/* Room ID */}
        {roomPda && (
          <div className="text-xs text-muted-foreground font-mono">
            Room: {shortRoom(roomPda)}
          </div>
        )}

        {/* Status Items */}
        <div className="space-y-3">
          {/* You accepted */}
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Check className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              {t("waitingPanel.youAccepted")}
            </span>
          </div>

          {/* Waiting for opponent */}
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                {isWaitingForRules 
                  ? t("waitingPanel.waitingOpponentAccept") 
                  : t("waitingPanel.waitingOpponentJoin", { default: "Waiting for opponent to join..." })}
              </span>
              {opponentWallet && (
                <span className="text-xs text-amber-500/70 font-mono">
                  {shortWallet(opponentWallet)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground">
          {t("waitingPanel.gameStartsAuto")}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleCopyLink}
            className="w-full gap-2"
          >
            {copied ? (
              <>
                <CheckCheck className="h-4 w-4 text-emerald-500" />
                {t("waitingPanel.linkCopied")}
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                {t("waitingPanel.copyInviteLink")}
              </>
            )}
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={onLeave}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            {t("waitingPanel.leaveMatch")}
          </Button>
        </div>
      </div>
    </div>
  );
}
