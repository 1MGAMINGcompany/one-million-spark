/**
 * LeaveMatchModal - Safe leave flow with NO wallet calls on default actions
 * 
 * CRITICAL RULES:
 * 1. "Leave Match" button NEVER triggers any wallet method
 * 2. Only explicit on-chain buttons can trigger wallet popups
 * 3. Each on-chain button shows confirmation with SOL amount
 * 
 * UI-Only Actions (no wallet):
 * - "Back to Rooms" - just navigate away
 * - "Copy Invite Link" - clipboard only
 * 
 * On-Chain Actions (require wallet):
 * - "Cancel Room (Refund)" - creator only, before match starts
 * - "Forfeit Match" - after match started, pays opponent
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { 
  LogOut, 
  Link2, 
  Undo2, 
  Flag, 
  AlertTriangle,
  Loader2,
  Check
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type MatchState = 
  | "waiting_for_opponent"    // Creator waiting, no one joined
  | "opponent_joined"         // Opponent joined but rules not accepted
  | "rules_pending"           // Both joined, rules acceptance in progress
  | "match_active"            // Match has started (both accepted rules)
  | "game_over";              // Game finished

interface LeaveMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  
  /** Current match state determines available actions */
  matchState: MatchState;
  
  /** Room PDA for display and invite link */
  roomPda: string;
  
  /** Is this user the room creator? */
  isCreator: boolean;
  
  /** Stake in SOL (for forfeit warning) */
  stakeSol: number;
  
  /** Callbacks for actions */
  onUILeave: () => void;           // UI-only: cleanup + navigate (NO wallet)
  onCancelRoom?: () => Promise<void>;  // On-chain: cancel room (creator refund)
  onForfeitMatch?: () => Promise<void>; // On-chain: forfeit (pay opponent)
  
  /** Loading states */
  isCancelling?: boolean;
  isForfeiting?: boolean;
}

export function LeaveMatchModal({
  open,
  onOpenChange,
  matchState,
  roomPda,
  isCreator,
  stakeSol,
  onUILeave,
  onCancelRoom,
  onForfeitMatch,
  isCancelling = false,
  isForfeiting = false,
}: LeaveMatchModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Confirmation dialogs for on-chain actions
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Generate invite link
  const inviteLink = `${window.location.origin}/join/${roomPda}`;
  const shortRoomId = roomPda.slice(0, 8) + "...";

  // Copy invite link to clipboard (UI only - NO wallet)
  const handleCopyLink = async () => {
    console.log("[LeaveMatch] UI action: Copy invite link");
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      toast({
        title: t("common.copied", "Copied!"),
        description: t("room.inviteLinkCopied", "Invite link copied to clipboard"),
      });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      toast({
        title: t("common.error", "Error"),
        description: t("common.copyFailed", "Failed to copy"),
        variant: "destructive",
      });
    }
  };

  // UI-only leave - NO wallet calls
  const handleUILeave = () => {
    console.log("[LeaveMatch] UI exit only - no wallet action");
    onOpenChange(false);
    onUILeave();
  };

  // Cancel room - ON-CHAIN action (show confirmation first)
  const handleCancelConfirmed = async () => {
    console.log("[LeaveMatch] On-chain action: Cancel room (refund)");
    setShowCancelConfirm(false);
    if (onCancelRoom) {
      await onCancelRoom();
    }
    onOpenChange(false);
  };

  // Forfeit match - ON-CHAIN action (show confirmation first)
  const handleForfeitConfirmed = async () => {
    console.log("[ForfeitMatch] On-chain action requested");
    setShowForfeitConfirm(false);
    if (onForfeitMatch) {
      await onForfeitMatch();
    }
    onOpenChange(false);
  };

  // Determine which actions are available based on match state
  const canCancel = isCreator && (matchState === "waiting_for_opponent" || matchState === "opponent_joined" || matchState === "rules_pending");
  const canForfeit = matchState === "match_active" && stakeSol > 0;
  const canSimplyLeave = matchState === "game_over" || matchState === "waiting_for_opponent";
  const showCopyLink = matchState === "waiting_for_opponent";

  // Determine warning message based on state
  const getWarningMessage = () => {
    switch (matchState) {
      case "waiting_for_opponent":
        return t("leaveMatch.waitingWarning", "You can leave safely or cancel to get your stake refunded.");
      case "opponent_joined":
      case "rules_pending":
        return t("leaveMatch.opponentJoinedWarning", "Your opponent has joined. Leaving without canceling will keep your stake locked.");
      case "match_active":
        return t("leaveMatch.activeWarning", "The match has started. Leaving will forfeit your stake to your opponent.");
      case "game_over":
        return t("leaveMatch.gameOverInfo", "The game has ended. You can leave safely.");
      default:
        return "";
    }
  };

  const isLoading = isCancelling || isForfeiting;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-muted-foreground" />
              {t("leaveMatch.title", "Leave Match")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Room: {shortRoomId}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* State-aware warning */}
            <div className={`rounded-lg p-3 text-sm ${
              matchState === "match_active" 
                ? "bg-destructive/10 border border-destructive/30 text-destructive" 
                : matchState === "game_over"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-600"
            }`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{getWarningMessage()}</p>
              </div>
            </div>

            {/* Available actions */}
            <div className="space-y-2">
              {/* Copy Invite Link - UI only */}
              {showCopyLink && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={handleCopyLink}
                  disabled={isLoading}
                >
                  {linkCopied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {linkCopied 
                    ? t("common.copied", "Copied!") 
                    : t("leaveMatch.copyInvite", "Copy Invite Link")
                  }
                </Button>
              )}

              {/* Cancel Room (Refund) - ON-CHAIN action */}
              {canCancel && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={isLoading}
                >
                  {isCancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="h-4 w-4" />
                  )}
                  {t("leaveMatch.cancelRefund", "Cancel Room (Refund)")}
                  {stakeSol > 0 && (
                    <span className="ml-auto text-xs font-mono">
                      +{stakeSol.toFixed(4)} SOL
                    </span>
                  )}
                </Button>
              )}

              {/* Forfeit Match - ON-CHAIN action */}
              {canForfeit && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => setShowForfeitConfirm(true)}
                  disabled={isLoading}
                >
                  {isForfeiting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Flag className="h-4 w-4" />
                  )}
                  {t("leaveMatch.forfeit", "Forfeit Match")}
                  <span className="ml-auto text-xs font-mono">
                    -{stakeSol.toFixed(4)} SOL
                  </span>
                </Button>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              variant={matchState === "match_active" ? "ghost" : "default"}
              className="flex-1"
              onClick={handleUILeave}
              disabled={isLoading}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t("leaveMatch.backToRooms", "Back to Rooms")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Room Confirmation - ON-CHAIN */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-amber-500" />
              {t("leaveMatch.confirmCancel", "Cancel Room?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("leaveMatch.cancelDescription", "This will close the room and refund your stake.")}
              {stakeSol > 0 && (
                <span className="block mt-2 font-medium text-foreground">
                  {t("leaveMatch.refundAmount", "You will receive")}: {stakeSol.toFixed(4)} SOL
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>
              {t("common.back", "Back")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirmed}
              disabled={isCancelling}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("common.processing", "Processing...")}
                </>
              ) : (
                t("leaveMatch.confirmCancelBtn", "Cancel & Refund")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Forfeit Match Confirmation - ON-CHAIN */}
      <AlertDialog open={showForfeitConfirm} onOpenChange={setShowForfeitConfirm}>
        <AlertDialogContent className="border-destructive/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Flag className="h-5 w-5" />
              {t("leaveMatch.confirmForfeit", "Forfeit Match?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("leaveMatch.forfeitDescription", "This action cannot be undone. Your stake will be paid to your opponent.")}
              <span className="block mt-2 font-medium text-destructive">
                {t("leaveMatch.forfeitAmount", "You will lose")}: {stakeSol.toFixed(4)} SOL
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isForfeiting}>
              {t("common.back", "Back")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForfeitConfirmed}
              disabled={isForfeiting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isForfeiting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("common.processing", "Processing...")}
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 mr-2" />
                  {t("leaveMatch.confirmForfeitBtn", "Forfeit Match")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
