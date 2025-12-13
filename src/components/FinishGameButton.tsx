import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFinishGameV5, usePlayersV5 } from "@/hooks/useRoomManagerV5";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Loader2 } from "lucide-react";

interface FinishGameButtonProps {
  roomId: bigint;
  isCreator: boolean;
  isRoomFull: boolean;
  onGameFinished?: () => void;
  suggestedWinner?: `0x${string}` | null;
}

export function FinishGameButton({
  roomId,
  isCreator,
  isRoomFull,
  onGameFinished,
  suggestedWinner,
}: FinishGameButtonProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedWinner, setSelectedWinner] = useState<string>("");

  const { data: players } = usePlayersV5(roomId);
  const {
    finishGame,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  } = useFinishGameV5();

  // Set suggested winner when available
  useEffect(() => {
    if (suggestedWinner && !selectedWinner) {
      setSelectedWinner(suggestedWinner);
    }
  }, [suggestedWinner, selectedWinner]);

  // Handle success
  useEffect(() => {
    if (isSuccess) {
      toast({
        title: t("game.gameFinished"),
        description: t("game.payoutSent"),
      });
      reset();
      onGameFinished?.();
    }
  }, [isSuccess, toast, reset, onGameFinished, t]);

  // Handle error
  useEffect(() => {
    if (error) {
      toast({
        title: t("errors.transactionFailed"),
        description: error.message || t("errors.unknown"),
        variant: "destructive",
      });
      reset();
    }
  }, [error, toast, reset, t]);

  // Only show if creator and room is full
  if (!isCreator || !isRoomFull) {
    return null;
  }

  const handleFinishGame = () => {
    if (!selectedWinner) {
      toast({
        title: t("game.selectWinner"),
        description: t("game.selectWinnerDesc"),
        variant: "destructive",
      });
      return;
    }

    finishGame(roomId, selectedWinner as `0x${string}`);
  };

  const isLoading = isPending || isConfirming;
  const playerList = (players as `0x${string}`[]) || [];

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="bg-card border border-primary/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {t("game.finishGame")}
        </h3>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("game.finishGameDesc")}
      </p>

      <Select value={selectedWinner} onValueChange={setSelectedWinner}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("game.selectWinner")} />
        </SelectTrigger>
        <SelectContent>
          {playerList.map((player) => (
            <SelectItem key={player} value={player}>
              {shortenAddress(player)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        onClick={handleFinishGame}
        disabled={isLoading || !selectedWinner}
        className="w-full gap-2 bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-600/90"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {isPending ? t("game.confirmInWallet") : t("game.processing")}
          </>
        ) : (
          <>
            <Trophy className="h-4 w-4" />
            {t("game.finishAndPay")}
          </>
        )}
      </Button>
    </div>
  );
}
