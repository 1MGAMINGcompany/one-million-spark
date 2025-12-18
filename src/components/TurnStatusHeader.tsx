import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { Crown, Clock, User } from "lucide-react";
import type { TurnPlayer } from "@/hooks/useTurnNotifications";

interface TurnStatusHeaderProps {
  isMyTurn: boolean;
  activePlayer: TurnPlayer | undefined;
  players: TurnPlayer[];
  myAddress: string | undefined;
  remainingTime?: number;
  showTimer?: boolean;
  className?: string;
}

const PLAYER_COLORS: Record<string, string> = {
  gold: "text-yellow-400",
  ruby: "text-red-400",
  emerald: "text-emerald-400",
  sapphire: "text-blue-400",
  red: "text-red-400",
  green: "text-emerald-400",
  blue: "text-blue-400",
  yellow: "text-yellow-400",
  white: "text-white",
  black: "text-gray-400",
};

const PLAYER_BG_COLORS: Record<string, string> = {
  gold: "bg-yellow-500/20 border-yellow-500/30",
  ruby: "bg-red-500/20 border-red-500/30",
  emerald: "bg-emerald-500/20 border-emerald-500/30",
  sapphire: "bg-blue-500/20 border-blue-500/30",
  red: "bg-red-500/20 border-red-500/30",
  green: "bg-emerald-500/20 border-emerald-500/30",
  blue: "bg-blue-500/20 border-blue-500/30",
  yellow: "bg-yellow-500/20 border-yellow-500/30",
  white: "bg-white/20 border-white/30",
  black: "bg-gray-500/20 border-gray-500/30",
};

function getPlayerDisplayName(player: TurnPlayer): string {
  if (player.name) return player.name;
  if (player.color) return `${player.color.charAt(0).toUpperCase() + player.color.slice(1)} Player`;
  return `Player ${player.seatIndex + 1}`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const TurnStatusHeader = memo(function TurnStatusHeader({
  isMyTurn,
  activePlayer,
  players,
  myAddress,
  remainingTime = 0,
  showTimer = false,
  className,
}: TurnStatusHeaderProps) {
  const activePlayers = players.filter((p) => p.status === "active");
  const playerCount = activePlayers.length;
  const isLowTime = remainingTime <= 10;
  const isCriticalTime = remainingTime <= 5;

  const activeColor = activePlayer?.color?.toLowerCase();
  const colorClass = activeColor ? PLAYER_COLORS[activeColor] : "text-primary";
  const bgColorClass = activeColor ? PLAYER_BG_COLORS[activeColor] : "bg-primary/20 border-primary/30";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Main Turn Status */}
      <div
        className={cn(
          "flex items-center justify-between rounded-lg border px-4 py-3 transition-all duration-300",
          isMyTurn
            ? "bg-primary/20 border-primary/50 shadow-[0_0_20px_rgba(250,204,21,0.15)]"
            : bgColorClass
        )}
      >
        <div className="flex items-center gap-3">
          {isMyTurn ? (
            <>
              <div className="relative">
                <Crown className="w-6 h-6 text-primary animate-pulse" />
                <div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-ping" />
              </div>
              <div>
                <span className="text-lg font-semibold text-primary">Your Turn</span>
                <p className="text-xs text-muted-foreground">{playerCount}-player game</p>
              </div>
            </>
          ) : activePlayer ? (
            <>
              <User className={cn("w-5 h-5", colorClass)} />
              <div>
                <span className={cn("text-base font-medium", colorClass)}>
                  Waiting for {getPlayerDisplayName(activePlayer)}
                </span>
                <p className="text-xs text-muted-foreground">{playerCount}-player game</p>
              </div>
            </>
          ) : (
            <>
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="text-base text-muted-foreground">Waiting...</span>
            </>
          )}
        </div>

        {/* Timer */}
        {showTimer && remainingTime > 0 && (
          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono",
              isMyTurn && isCriticalTime
                ? "bg-destructive/30 text-destructive animate-pulse"
                : isMyTurn && isLowTime
                ? "bg-yellow-500/30 text-yellow-400"
                : "bg-muted/50 text-muted-foreground"
            )}
          >
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">{formatTime(remainingTime)}</span>
          </div>
        )}
      </div>

      {/* My Turn Badge - Only shown when it's user's turn */}
      {isMyTurn && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-primary/30 to-yellow-500/30 border border-primary/50 rounded-full shadow-[0_0_15px_rgba(250,204,21,0.25)] animate-pulse">
            <Crown className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">MY TURN</span>
          </div>
        </div>
      )}

      {/* Player Status Row */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {players.map((player) => {
          const isActive = player.address === activePlayer?.address;
          const isMe = player.address === myAddress;
          const color = player.color?.toLowerCase();
          const dotColor = color ? PLAYER_COLORS[color] : "text-muted-foreground";

          return (
            <div
              key={player.address}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all",
                isActive && "bg-muted/50 ring-1 ring-primary/50",
                player.status === "finished" && "opacity-50",
                player.status === "disconnected" && "opacity-30"
              )}
            >
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  player.status === "active"
                    ? isActive
                      ? "bg-primary animate-pulse"
                      : `bg-current ${dotColor}`
                    : player.status === "finished"
                    ? "bg-green-500"
                    : "bg-red-500"
                )}
              />
              <span className={cn("font-medium", isMe && "text-primary")}>
                {isMe ? "You" : getPlayerDisplayName(player)}
              </span>
              {player.status === "finished" && (
                <span className="text-green-500 text-[10px]">✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default TurnStatusHeader;
