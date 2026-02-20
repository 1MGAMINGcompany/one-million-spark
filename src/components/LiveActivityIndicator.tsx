import { useLiveStats } from "@/hooks/useLiveStats";
import { useTranslation } from "react-i18next";

export function LiveActivityIndicator() {
  const { browsing, roomsWaiting, visitsToday, loading } = useLiveStats();
  const { t } = useTranslation();

  if (loading) return null;

  const hasLive = browsing > 0;
  const hasToday = visitsToday > 0;
  const isEmpty = !hasLive && !hasToday;

  return (
    <div className="flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground transition-opacity duration-500">
      {isEmpty ? (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full bg-primary/70 animate-pulse-gold"
            aria-hidden="true"
          />
          <span className="font-light tracking-wide">
            {t("liveStats.beTheFirst", "Be the first to start a match.")}
          </span>
        </div>
      ) : (
        <>
          {/* Live row */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-primary/70 animate-pulse-gold"
              aria-hidden="true"
            />
            <span className="font-light tracking-wide">
              {hasLive ? (
                <>
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
                </>
              ) : (
                <>
                  {t("liveStats.beTheFirst", "Be the first to start a match.")}
                </>
              )}
            </span>
          </div>

          {/* Visitors today row */}
          {hasToday && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
              <span className="transition-all duration-300 font-medium text-primary/80">{visitsToday.toLocaleString()}</span>
              {" "}
              <span>{t("liveStats.visitsToday", "visitors today")}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
