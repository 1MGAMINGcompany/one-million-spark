import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, RefreshCw, XCircle, Trophy } from "lucide-react";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { RoomStatus } from "@/lib/solana-program";
import { useToast } from "@/hooks/use-toast";

interface ResolveRoomModalProps {
  open: boolean;
  onClose: () => void;
  roomPda: string;
  roomData: {
    playerCount: number;
    creator: string;
    status: number;
    stakeLamports: number;
    gameType: string;
    roomId: number;
  };
  walletAddress: string;
  onResolved: () => void;
}

type ResolveAction = "cancel" | "forfeit" | "return";

export function ResolveRoomModal({
  open,
  onClose,
  roomPda,
  roomData,
  walletAddress,
  onResolved,
}: ResolveRoomModalProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { cancelRoomByPda, forfeitGame, fetchRooms } = useSolanaRooms();
  const [loading, setLoading] = useState(false);

  // Decision tree based ONLY on on-chain state
  const isCreator = roomData.creator === walletAddress;
  const playerCount = roomData.playerCount;
  const isFinished = roomData.status === RoomStatus.Finished;
  const isCancelled = roomData.status === RoomStatus.Cancelled;

  // Determine available action
  let action: ResolveAction = "return";
  let title = "";
  let description = "";
  let buttonText = "";
  let buttonVariant: "default" | "destructive" | "outline" = "default";

  if (isFinished || isCancelled) {
    action = "return";
    title = t("resolveRoom.roomCompleted", "Room Completed");
    description = t(
      "resolveRoom.roomCompletedDesc",
      "This room is already finished. Return to room list to continue."
    );
    buttonText = t("resolveRoom.returnToRooms", "Return to Rooms");
    buttonVariant = "outline";
  } else if (playerCount === 1 && isCreator) {
    action = "cancel";
    title = t("resolveRoom.cancelRoom", "Cancel Room (Refund)");
    description = t(
      "resolveRoom.cancelRoomDesc",
      "No opponent has joined yet. Cancel the room to get your full stake refunded."
    );
    buttonText = t("resolveRoom.cancelAndRefund", "Cancel & Get Refund");
    buttonVariant = "default";
  } else if (playerCount >= 2) {
    // IMPORTANT: NO "game started", "ready pressed", or vault balance checks!
    action = "forfeit";
    title = t("resolveRoom.forfeitMatch", "Forfeit Match");
    description = t(
      "resolveRoom.forfeitMatchDesc",
      "An opponent has joined this room. Forfeiting will pay out the opponent (95%) and platform fee (5%). This action cannot be undone."
    );
    buttonText = t("resolveRoom.forfeitAndPayout", "Forfeit (Opponent Wins)");
    buttonVariant = "destructive";
  }

  const clearRoomData = () => {
    // Clear all room-related storage
    localStorage.removeItem(`room_mode_${roomPda}`);
    sessionStorage.removeItem(`accepted_rules_${roomPda}`);
    sessionStorage.removeItem(`webrtc_${roomPda}`);
    sessionStorage.removeItem(`game_session_${roomPda}`);
  };

  const handleAction = async () => {
    setLoading(true);

    try {
      if (action === "return") {
        clearRoomData();
        onResolved();
        onClose();
        navigate("/room-list");
        return;
      }

      if (action === "cancel") {
        const success = await cancelRoomByPda(roomPda);
        if (success) {
          toast({
            title: t("resolveRoom.cancelSuccess", "Room Cancelled"),
            description: t(
              "resolveRoom.cancelSuccessDesc",
              "Your stake has been refunded to your wallet."
            ),
          });
          clearRoomData();
          await fetchRooms();
          onResolved();
          onClose();
          navigate("/room-list");
        } else {
          toast({
            title: t("resolveRoom.cancelFailed", "Cancel Failed"),
            description: t(
              "resolveRoom.cancelFailedDesc",
              "Could not cancel the room. Please try again."
            ),
            variant: "destructive",
          });
        }
      }

      if (action === "forfeit") {
        const result = await forfeitGame(roomPda, roomData.gameType);
        if (result.ok) {
          toast({
            title: t("resolveRoom.forfeitSuccess", "Match Forfeited"),
            description: t(
              "resolveRoom.forfeitSuccessDesc",
              "The match has been forfeited. Opponent has been paid out."
            ),
          });
          clearRoomData();
          await fetchRooms();
          onResolved();
          onClose();
          navigate("/room-list");
        } else {
          toast({
            title: t("resolveRoom.forfeitFailed", "Forfeit Failed"),
            description: result.reason || t(
              "resolveRoom.forfeitFailedDesc",
              "Could not forfeit the match. Please try again."
            ),
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error("[ResolveRoomModal] Action failed:", err);
      toast({
        title: t("resolveRoom.error", "Error"),
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === "cancel" && <RefreshCw className="h-5 w-5 text-primary" />}
            {action === "forfeit" && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {action === "return" && <Trophy className="h-5 w-5 text-primary" />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Room ID:</span>
            <span className="font-mono">#{roomData.roomId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Game:</span>
            <span className="capitalize">{roomData.gameType}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Players:</span>
            <span>{playerCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span>
              {isFinished
                ? "Finished"
                : isCancelled
                ? "Cancelled"
                : playerCount >= 2
                ? "In Progress"
                : "Waiting"}
            </span>
          </div>
          {roomData.stakeLamports > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Stake:</span>
              <span>{(roomData.stakeLamports / 1e9).toFixed(4)} SOL</span>
            </div>
          )}
        </div>

        {action === "forfeit" && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
            <strong>Warning:</strong> Forfeiting means you lose and your opponent wins the pot.
            This cannot be undone.
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common.back", "Back")}
          </Button>
          <Button
            variant={buttonVariant}
            onClick={handleAction}
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                {t("common.processing", "Processing...")}
              </>
            ) : action === "forfeit" ? (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                {buttonText}
              </>
            ) : (
              buttonText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
