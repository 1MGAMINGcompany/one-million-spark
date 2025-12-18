import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { Crown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TurnBannerProps {
  gameName: string;
  roomId: string;
  isVisible: boolean;
  onGoToGame?: () => void;
  className?: string;
}

/**
 * Persistent in-app banner shown when it's the user's turn.
 * This is a fallback for when push notifications are unavailable or disabled.
 */
export const TurnBanner = memo(function TurnBanner({
  gameName,
  roomId,
  isVisible,
  onGoToGame,
  className,
}: TurnBannerProps) {
  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50",
        "bg-gradient-to-r from-primary/90 to-yellow-500/90 backdrop-blur-md",
        "border border-primary/50 rounded-xl shadow-[0_0_30px_rgba(250,204,21,0.3)]",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
        className
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-background/20 flex items-center justify-center">
            <Crown className="w-6 h-6 text-background" />
          </div>
          <div className="absolute inset-0 rounded-full bg-background/20 animate-ping" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-bold text-background text-sm">Your Turn!</p>
          <p className="text-xs text-background/80 truncate">
            It's your move in {gameName}
          </p>
        </div>

        {onGoToGame && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onGoToGame}
            className="flex-shrink-0 gap-1 bg-background/20 hover:bg-background/30 text-background border-0"
          >
            Play
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
});

export default TurnBanner;
