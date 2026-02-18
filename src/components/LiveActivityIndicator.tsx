import { useLiveStats } from "@/hooks/useLiveStats";
import { useTranslation } from "react-i18next";

export function LiveActivityIndicator() {
  const { browsing, roomsWaiting, loading } = useLiveStats();
  const { t } = useTranslation();

  if (loading) return null;

  const isEmpty = browsing === 0 && roomsWaiting === 0;

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground transition-opacity duration-500">
      {/* Pulsing dot */}
      <span
        className="inline-block w-2 h-2 rounded-full bg-primary/70 animate-pulse-gold"
        aria-hidden="true"
      />

      {isEmpty ? (
        <span className="font-light tracking-wide">
          {t("home.beTheFirst", "Be the first to start a match.")}
        </span>
      ) : (
        <span className="font-light tracking-wide">
          <span className="transition-all duration-300">{browsing}</span>
          {" "}
          {t("liveStats.browsingNow", "browsing now")}
          {roomsWaiting > 0 && (
            <>
              <span className="mx-1.5 text-primary/40">•</span>
              <span className="transition-all duration-300">{roomsWaiting}</span>
              {" "}
              {t("liveStats.roomsWaiting", "rooms waiting")}
            </>
          )}
        </span>
      )}
    </div>
  );
}
