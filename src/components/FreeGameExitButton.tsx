/**
 * FreeGameExitButton: Small X close button for free-* rooms.
 * Handles cancel (waiting) and leave (active) with confirmation.
 */
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { getAnonId, clearActiveRoom } from "@/lib/anonIdentity";
import { useToast } from "@/hooks/use-toast";

interface FreeGameExitButtonProps {
  roomPda: string;
  /** If known, the current room status */
  status?: string;
}

export function FreeGameExitButton({ roomPda, status }: FreeGameExitButtonProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { address } = useWallet();
  const [showConfirm, setShowConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const playerId = address || getAnonId();

  const handleExit = useCallback(async () => {
    setLeaving(true);
    try {
      // If waiting, cancel; if active, leave
      const action = status === "waiting" ? "cancel" : "leave";
      await supabase.functions.invoke("free-match", {
        body: { action, roomPda, playerId, wallet: address || undefined },
      });
      clearActiveRoom();
      toast({ title: t("quickPlay.leftMatch") });
    } catch (e) {
      console.warn("[FreeGameExitButton] exit error:", e);
    } finally {
      setLeaving(false);
      navigate("/quick-match");
    }
  }, [roomPda, status, playerId, address, navigate, toast, t]);

  const handleClick = () => {
    // If waiting (no opponent yet), exit immediately
    if (status === "waiting") {
      handleExit();
      return;
    }
    // Active game — confirm first
    setShowConfirm(true);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-20 right-4 z-50 h-8 w-8 rounded-full bg-background/80 backdrop-blur border border-border hover:bg-destructive/10"
        onClick={handleClick}
        disabled={leaving}
      >
        <X className="h-4 w-4" />
      </Button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quickPlay.leaveMatch")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quickPlay.leaveMatchDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("quickMatch.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleExit} disabled={leaving}>
              {t("quickPlay.confirmLeave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
