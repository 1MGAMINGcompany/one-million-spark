import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff, Clock, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface OpponentAbsenceIndicatorProps {
  /** Number of strikes (missed turns) by the absent player (0-3) */
  opponentStrikes: number;
  /** Turn time in seconds (from room config) */
  turnTimeSeconds: number;
  /** ISO timestamp when the current turn started */
  turnStartedAt: string | null;
  /** Whether it's currently the opponent's turn */
  isOpponentsTurn: boolean;
  /** Number of players in the game (2 for most games, 2-4 for Ludo) */
  playerCount?: number;
  /** Display name for the absent player (optional, for Ludo multi-player) */
  opponentName?: string;
}

/**
 * Displays an informative banner when an opponent has missed turns.
 * Shows countdown to next timeout and strike progress.
 * For Ludo 3-4 player games, shows "elimination" messaging instead of "forfeit".
 */
export function OpponentAbsenceIndicator({
  opponentStrikes,
  turnTimeSeconds,
  turnStartedAt,
  isOpponentsTurn,
  playerCount = 2,
  opponentName,
}: OpponentAbsenceIndicatorProps) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(0);

  // Calculate countdown to next timeout
  useEffect(() => {
    if (!turnStartedAt || !isOpponentsTurn) {
      setCountdown(0);
      return;
    }

    const tick = () => {
      const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
      const remaining = Math.max(0, turnTimeSeconds - elapsed);
      setCountdown(Math.ceil(remaining));
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [turnStartedAt, turnTimeSeconds, isOpponentsTurn]);

  // Only show when opponent has at least 1 strike AND it's their turn
  if (!isOpponentsTurn || opponentStrikes === 0) {
    return null;
  }

  // Format countdown as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `0:${secs.toString().padStart(2, "0")}`;
  };

  const isLudoMultiplayer = playerCount > 2;
  const strikeProgress = (opponentStrikes / 3) * 100;

  // Determine the display name for the absent player
  const displayName = opponentName || t("gameSession.opponent");

  // Messaging varies based on game type (2-player forfeit vs Ludo elimination)
  const getMissedTurnsMessage = () => {
    if (isLudoMultiplayer) {
      return t("gameSession.playerMissedTurns", { player: displayName, count: opponentStrikes });
    }
    return t("gameSession.opponentMissedTurns", { count: opponentStrikes });
  };

  const getOutcomeMessage = () => {
    if (isLudoMultiplayer) {
      return t("gameSession.playerWillBeEliminated", { player: displayName, time: formatTime(countdown) });
    }
    return `${t("gameSession.autoWinIn")}: ${formatTime(countdown)}`;
  };

  return (
    <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center gap-2 text-warning mb-1">
        <WifiOff className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
        <span className="font-medium text-sm sm:text-base">
          {t("gameSession.opponentAbsent")}
        </span>
      </div>

      {/* Strike count */}
      <p className="text-xs sm:text-sm text-muted-foreground">
        {getMissedTurnsMessage()}
      </p>

      {/* Countdown */}
      <div className="flex items-center gap-2 mt-2">
        <Clock className="h-4 w-4 text-warning flex-shrink-0" />
        <p className="text-base sm:text-lg font-mono text-warning font-medium">
          {getOutcomeMessage()}
        </p>
      </div>

      {/* Strike progress bar */}
      <div className="mt-2">
        <Progress 
          value={strikeProgress} 
          className="h-1.5 bg-warning/20 [&>div]:bg-warning" 
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>{opponentStrikes}/3 {t("gameSession.strikes")}</span>
          {opponentStrikes >= 2 && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" />
              {t("gameSession.nextTimeoutWins")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
