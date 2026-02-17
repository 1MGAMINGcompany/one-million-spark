import React, { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

interface TurnBannerProps {
  gameName: string;
  roomId: string;
  isVisible: boolean;
  onGoToGame?: () => void;
  className?: string;
}

/**
 * Compact toast-style banner shown briefly when it's the user's turn.
 * Auto-dismisses after 2 seconds.
 */
export const TurnBanner = memo(function TurnBanner({
  gameName,
  roomId,
  isVisible,
  onGoToGame,
  className,
}: TurnBannerProps) {
  const [show, setShow] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 2000);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isVisible]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed top-20 left-1/2 -translate-x-1/2 z-50",
        "bg-primary/95 backdrop-blur-sm",
        "border border-primary/50 rounded-full shadow-lg px-4 py-2",
        "animate-fade-in",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-primary-foreground" />
        <p className="font-semibold text-primary-foreground text-sm">{t("turnBanner.yourTurn")}</p>
      </div>
    </div>
  );
});

export default TurnBanner;
