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
import { Flag, AlertTriangle } from "lucide-react";

interface ForfeitConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  gameType?: "2player" | "ludo";
  stakeSol?: number;
}

export function ForfeitConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  gameType = "2player",
  stakeSol,
}: ForfeitConfirmDialogProps) {
  const { t } = useTranslation();

  const isLudo = gameType === "ludo";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-destructive/20 bg-card">
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
