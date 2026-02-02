/**
 * SettingsFailedModal
 * 
 * Shown when game settings fail to save after retries.
 * Offers auto-cancel to protect user's stake from wrong turn times.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface SettingsFailedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomPda: string;
  onCancelRoom: () => Promise<void>;
  onProceedAnyway?: () => void;
  showProceedOption?: boolean;
  mode?: "casual" | "ranked" | "private";
}

export function SettingsFailedModal({
  open,
  onOpenChange,
  roomPda,
  onCancelRoom,
  onProceedAnyway,
  showProceedOption = false,
  mode = "casual",
}: SettingsFailedModalProps) {
  const { t } = useTranslation();
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancelRoom = async () => {
    setIsCanceling(true);
    setCancelError(null);

    try {
      await onCancelRoom();
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to cancel room";
      console.error("[SettingsFailedModal] Cancel failed:", err);
      setCancelError(errorMsg);
    } finally {
      setIsCanceling(false);
    }
  };

  const handleProceedAnyway = () => {
    if (onProceedAnyway) {
      onProceedAnyway();
    }
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-lg">
              {t("createRoom.settingsFailedTitle", "Room Settings Failed")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left pt-2 space-y-3">
            <p>
              {t(
                "createRoom.settingsFailedDesc",
                "Room settings failed to save. The turn timer may default to an incorrect value, which could affect gameplay fairness."
              )}
            </p>
            <p className="text-sm font-medium text-foreground">
              {t(
                "createRoom.settingsFailedProtection",
                "To protect your stake, we recommend canceling this room and trying again."
              )}
            </p>
            {cancelError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{cancelError}</p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          {/* Proceed anyway only allowed for casual mode */}
          {showProceedOption && mode === "casual" && (
            <Button
              variant="outline"
              onClick={handleProceedAnyway}
              disabled={isCanceling}
              className="w-full sm:w-auto"
            >
              {t("createRoom.proceedAnyway", "Proceed Anyway")}
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={handleCancelRoom}
            disabled={isCanceling}
            className="w-full sm:w-auto"
          >
            {isCanceling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("createRoom.canceling", "Canceling...")}
              </>
            ) : (
              t("createRoom.cancelAndRefund", "Cancel Room & Refund")
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
