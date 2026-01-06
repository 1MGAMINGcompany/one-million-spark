/**
 * LeaveMatchModal - Safe leave flow with NO wallet calls on default actions
 * 
 * CRITICAL RULES:
 * 1. "Leave Match" button NEVER triggers any wallet method
 * 2. Only explicit on-chain buttons can trigger wallet popups
 * 3. Each on-chain button shows confirmation with SOL amount
 * 4. All on-chain actions MUST use TxLock to prevent Phantom "Request blocked"
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
import { useTxLock } from "@/contexts/TxLockContext";

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
  
  /** On-chain player count - CRITICAL: cancel_room only works when playerCount === 1 */
  playerCount?: number;
  
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
  playerCount,
  onUILeave,
  onCancelRoom,
  onForfeitMatch,
  isCancelling = false,
  isForfeiting = false,
}: LeaveMatchModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // TxLock to prevent Phantom "Request blocked" popups
  const { isTxInFlight } = useTxLock();
  
  // Local submitting guard to prevent double-clicks
  const [localSubmitting, setLocalSubmitting] = useState(false);
  
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
  // ALL SAFETY GUARDS: preventDefault, stopPropagation, localSubmitting, isTxInFlight
  const handleCancelConfirmed = async (e: React.MouseEvent) => {
    // Stop event propagation
    e.preventDefault();
    e.stopPropagation();
    
    // Guard: already submitting
    if (localSubmitting || isTxInFlight) {
      console.log("[TX] Already submitting, ignoring click");
      return;
    }
    
    console.log("[TX_REQUEST] action=cancel_room");
    setLocalSubmitting(true);
    setShowCancelConfirm(false);
    
    try {
      if (onCancelRoom) {
        await onCancelRoom();
      }
    } finally {
      setLocalSubmitting(false);
      onOpenChange(false);
    }
  };

  // Forfeit match - ON-CHAIN action (show confirmation first)
  // ALL SAFETY GUARDS: preventDefault, stopPropagation, localSubmitting, isTxInFlight
  const handleForfeitConfirmed = async (e: React.MouseEvent) => {
    // Stop event propagation
    e.preventDefault();
    e.stopPropagation();
    
    // Guard: already submitting
    if (localSubmitting || isTxInFlight) {
      console.log("[TX] Already submitting, ignoring click");
      return;
    }
    
    console.log("[TX_REQUEST] action=forfeit");
    setLocalSubmitting(true);
    setShowForfeitConfirm(false);
    
    try {
      if (onForfeitMatch) {
        await onForfeitMatch();
      }
    } finally {
      setLocalSubmitting(false);
      onOpenChange(false);
    }
  };

  // Determine which actions are available based on match state
  // CRITICAL: cancel_room only works when player_count === 1
  // Only show "Cancel Room (Refund)" when playerCount === 1 AND waiting_for_opponent
  const canCancel = isCreator && 
    matchState === "waiting_for_opponent" && 
    (playerCount === undefined || playerCount === 1);
  
  // Show "refund not available" message when opponent joined but game not started (can't cancel on-chain)
  const showRefundUnavailable = isCreator && 
    (matchState === "opponent_joined" || matchState === "rules_pending") && 
    playerCount !== undefined && playerCount >= 2;
    
  const canForfeit = matchState === "match_active" && stakeSol > 0 && onForfeitMatch !== undefined;
  const canSimplyLeave = matchState === "game_over" || matchState === "waiting_for_opponent";
  const showCopyLink = matchState === "waiting_for_opponent";
  
  // Log match state for debugging invalid state transitions
  console.log("[LeaveMatchModal]", { matchState, canCancel, canForfeit, isTxInFlight });

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

  // Block all tx buttons if any tx in flight (prevent Phantom "Request blocked")
  const isLoading = isCancelling || isForfeiting || isTxInFlight || localSubmitting;

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

              {/* Cancel Room (Refund) - ON-CHAIN action - ONLY when playerCount === 1 */}
              {canCancel && (
                <Button
                  type="button"
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
              
              {/* Refund not available message - when playerCount >= 2 but game not started */}
              {showRefundUnavailable && (
                <div className="rounded-lg p-3 text-sm bg-muted border">
                  <p className="text-muted-foreground">
                    Refund not available after opponent joins. Use "Back to Rooms" to leave safely.
                  </p>
                </div>
              )}

              {/* Forfeit Match - ON-CHAIN action */}
              {canForfeit && (
                <Button
                  type="button"
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
            <AlertDialogCancel disabled={isLoading}>
              {t("common.back", "Back")}
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={handleCancelConfirmed}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isCancelling || localSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("common.processing", "Processing...")}
                </>
              ) : (
                t("leaveMatch.confirmCancelBtn", "Cancel & Refund")
              )}
            </Button>
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
            <AlertDialogCancel disabled={isLoading}>
              {t("common.back", "Back")}
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={handleForfeitConfirmed}
              disabled={isLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isForfeiting || localSubmitting ? (
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
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
