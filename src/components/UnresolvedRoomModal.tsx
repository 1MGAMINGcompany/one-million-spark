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
import { AlertTriangle, Coins, Users, Gamepad2 } from "lucide-react";
import type { RoomDisplay } from "@/lib/solana-program";

interface UnresolvedRoomModalProps {
  open: boolean;
  onClose: () => void;
  room: RoomDisplay | null;
  onResolve: (roomPda: string) => void;
}

export function UnresolvedRoomModal({
  open,
  onClose,
  room,
  onResolve,
}: UnresolvedRoomModalProps) {
  const { t } = useTranslation();

  if (!room) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t("unresolvedRoom.title", "Finish Your Active Game")}
          </DialogTitle>
          <DialogDescription>
            {t("unresolvedRoom.description", "You already have an active game that hasn't been settled yet.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Explanation */}
          <p className="text-sm text-muted-foreground">
            {t("unresolvedRoom.explanation", "Solana requires games to be finalized to protect player funds.")}
          </p>

          {/* Room Details Card */}
          <div className="p-4 bg-muted/50 rounded-lg border border-border/50 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
                <Gamepad2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{room.gameTypeName}</p>
                <p className="text-xs text-muted-foreground">
                  Room #{room.roomId} • {room.statusName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Coins className="h-4 w-4" />
                {room.entryFeeSol > 0 ? `${room.entryFeeSol} SOL` : "Free"}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {room.playerCount}/{room.maxPlayers} players
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            {t("unresolvedRoom.cancelButton", "Cancel")}
          </Button>
          <Button 
            onClick={() => onResolve(room.pda)} 
            className="w-full sm:w-auto"
          >
            {t("unresolvedRoom.resolveButton", "Resolve Game")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
