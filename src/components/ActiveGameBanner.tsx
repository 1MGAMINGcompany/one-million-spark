import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Users } from "lucide-react";
import { RoomDisplay, RoomStatus, isOpenStatus } from "@/lib/solana-program";

interface ActiveGameBannerProps {
  room: RoomDisplay;
}

export function ActiveGameBanner({ room }: ActiveGameBannerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const isStarted = room.status === RoomStatus.Started;
  const isWaiting = isOpenStatus(room.status);

  const handleEnterGame = () => {
    // Use canonical /play/:pda route - game type comes from on-chain data
    navigate(`/play/${room.pda}`);
  };

  const handleViewRoom = () => {
    navigate(`/room/${room.pda}`);
  };

  if (isStarted) {
    return (
      <Card className="border-primary/50 bg-primary/10 backdrop-blur mb-6 animate-fade-in">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-primary">{t("gameBanner.gameReady")}</p>
                <p className="text-sm text-muted-foreground">
                  {room.gameTypeName} • {room.entryFeeSol} SOL
                </p>
              </div>
            </div>
            <Button onClick={handleEnterGame} className="shrink-0">
              <Play className="h-4 w-4 mr-2" />
              {t("gameBanner.enterGame")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isWaiting) {
    return (
      <Card className="border-amber-500/50 bg-amber-500/10 backdrop-blur mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-semibold text-amber-500">{t("gameBanner.waitingForOpponent")}</p>
                <p className="text-sm text-muted-foreground">
                  {room.gameTypeName} • {t("game.room")} #{room.roomId}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleViewRoom} className="shrink-0">
              {t("gameBanner.viewRoom")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
