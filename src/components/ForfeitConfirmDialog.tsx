import { useTranslation } from "react-i18next";
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
import { Flag, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForfeitConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  gameType?: "2player" | "ludo";
  stakeSol?: number;
  /** When true, shows "Cancel Room" instead of forfeit (room not started yet) */
  roomNotStarted?: boolean;
  /** Called when user clicks "Cancel Room" */
  onCancelRoom?: () => void;
  /** Loading state for cancel room action */
  isCancellingRoom?: boolean;
}

export function ForfeitConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  gameType = "2player",
  stakeSol,
  roomNotStarted = false,
  onCancelRoom,
  isCancellingRoom = false,
}: ForfeitConfirmDialogProps) {
  const { t } = useTranslation();

  const isLudo = gameType === "ludo";

  // If room not started, show cancel room UI instead
  if (roomNotStarted) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="border-muted bg-card max-w-[90vw] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <XCircle className="h-5 w-5" />
              {t("forfeit.waitingForOpponent", "Waiting for Opponent")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t(
                "forfeit.cancelRoomDescription",
                "No opponent has joined yet. Cancel the room to get your full stake refunded."
              )}
              {stakeSol && stakeSol > 0 && (
                <span className="block mt-2 text-primary font-medium">
                  {t("forfeit.refundAmount", "You will receive {{stake}} SOL back", { stake: stakeSol.toFixed(3) })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancellingRoom}>
              {t("common.close", "Close")}
            </AlertDialogCancel>
            <Button
              onClick={onCancelRoom}
              disabled={isCancellingRoom || !onCancelRoom}
              variant="default"
            >
              <XCircle className="h-4 w-4 mr-2" />
              {isCancellingRoom 
                ? t("common.processing", "Processing...") 
                : t("forfeit.cancelRoom", "Cancel Room & Refund")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-destructive/20 bg-card max-w-[90vw] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t("forfeit.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {isLudo ? t("forfeit.warningLudo") : t("forfeit.warning2Player")}
            {stakeSol && stakeSol > 0 && !isLudo && (
              <span className="block mt-2 text-destructive font-medium">
                {t("forfeit.stakeWarning", { stake: stakeSol.toFixed(3) })}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {t("forfeit.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Flag className="h-4 w-4 mr-2" />
            {isLoading ? t("common.processing") : t("forfeit.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
