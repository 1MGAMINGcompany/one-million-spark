import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Lightbulb } from "lucide-react";
import { getTeamLogo } from "@/lib/teamLogos";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import { formatEventDateTime } from "@/lib/formatEventLocalDateTime";
import type { Fight } from "@/components/predictions/FightCard";
import { useLiveGameState } from "@/hooks/useSportsWebSocket";
import LiveGameBadge, { LiveScoreDisplay } from "@/components/predictions/LiveGameBadge";
import type { OperatorTheme } from "@/lib/operatorThemes";

interface SimplePredictionCardProps {
  fight: Fight & { _broadSport?: string; _league?: string };
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b" | "draw") => void;
  userEntry?: { fighter_pick: string; amount_usd: number | null; claimed: boolean } | null;
  onClaim?: (fightId: string) => void;
  claiming?: boolean;
  theme: OperatorTheme;
  onShareWin?: (fight: Fight) => void;
  onGraph?: (fight: Fight) => void;
  onTips?: (fight: Fight) => void;
}

function getTimeLabel(eventDate: string | null | undefined, t: (key: string, opts?: any) => string): { text: string; isLive: boolean } | null {
  if (!eventDate) return null;
  const d = new Date(eventDate);
  const now = Date.now();
  const diff = d.getTime() - now;
  // Never show LIVE from time heuristic — only LiveGameBadge should do that
  if (diff < 0) return null;
  if (diff < 3600000) return { text: t("operator.startsInMin", { min: Math.max(1, Math.round(diff / 60000)) }), isLive: false };
  if (diff < 86400000) return { text: t("operator.startsInHour", { hour: Math.round(diff / 3600000) }), isLive: false };
  return null;
}

function calcPayout(price: number | null, amount: number): number {
  if (!price || price <= 0) return amount;
  return amount / price;
}

function getOddsFromFight(fight: Fight): { priceA: number; priceB: number } {
  const pA = fight.price_a ?? 0;
  const pB = fight.price_b ?? 0;
  if (pA > 0 && pB > 0) return { priceA: pA, priceB: pB };
  if (pA > 0) return { priceA: pA, priceB: 1 - pA };
  if (pB > 0) return { priceA: 1 - pB, priceB: pB };
  const poolA = (fight.pool_a_usd ?? 0) || fight.pool_a_lamports / 1e9;
  const poolB = (fight.pool_b_usd ?? 0) || fight.pool_b_lamports / 1e9;
  const total = poolA + poolB;
  if (total === 0) return { priceA: 0.5, priceB: 0.5 };
  return { priceA: poolA / total, priceB: poolB / total };
}

export default function SimplePredictionCard({
  fight,
  onPredict,
  userEntry,
  onClaim,
  claiming,
  theme,
  onShareWin,
  onGraph,
  onTips,
}: SimplePredictionCardProps) {
  const { t } = useTranslation();
  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);
  const { priceA, priceB } = getOddsFromFight(fight);
  const payoutA = calcPayout(priceA, 10);
  const payoutB = calcPayout(priceB, 10);
  const multiplierA = priceA > 0 ? (1 / priceA).toFixed(2) : "—";
  const multiplierB = priceB > 0 ? (1 / priceB).toFixed(2) : "—";

  // Live game data from Polymarket Sports WebSocket
  const liveState = useLiveGameState((fight as any).polymarket_slug);

  const logoDataA = getTeamLogo(nameA, fight.event_name);
  const logoDataB = getTeamLogo(nameB, fight.event_name);
  const logoA = logoDataA?.url || null;
  const logoB = logoDataB?.url || null;

  const hasDrawOption = !!(fight as any).draw_allowed;
  const isStarted = (fight as any).event_date && new Date((fight as any).event_date).getTime() < Date.now();
  const isPolymarket = !!(fight as any).polymarket_slug;
  const isOpen = fight.status === "open" || fight.status === "live" || (fight.status === "locked" && isStarted && isPolymarket);
  const isSettled = ["settled", "confirmed", "result_selected"].includes(fight.status);
  const userPicked = userEntry?.fighter_pick;
  const userWon = isSettled && fight.winner === userPicked;
  const [winShared, setWinShared] = useState(false);

  const eventDateStr = (fight as any).event_date
    ? formatEventDateTime((fight as any).event_date)
    : null;

  const leagueName = (fight as any)._league || fight.event_name?.split(" — ")[0] || fight.event_name;
  const broadSportLabel = (fight as any)._broadSport && (fight as any)._broadSport !== "OTHER"
    ? ((fight as any)._broadSport as string).charAt(0) + ((fight as any)._broadSport as string).slice(1).toLowerCase()
    : null;
  const sportLeagueLabel = broadSportLabel && leagueName && leagueName !== "Other"
    ? `${broadSportLabel.toUpperCase()} • ${leagueName}`
    : broadSportLabel
      ? broadSportLabel.toUpperCase()
      : leagueName;
  const timeLabel = getTimeLabel((fight as any).event_date, t);

  const cardStyle = {
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
  };

  // Graph button component
  const GraphButton = () => (
    onGraph ? (
      <button
        onClick={(e) => { e.stopPropagation(); onGraph(fight); }}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:opacity-80"
        style={{
          backgroundColor: theme.surfaceBg,
          border: `1px solid ${theme.cardBorder}`,
          color: theme.textSecondary,
        }}
      >
        <BarChart3 className="w-3 h-3" />
        Graph
      </button>
    ) : null
  );

  const TipsButton = () => (
    onTips ? (
      <button
        onClick={(e) => { e.stopPropagation(); onTips(fight); }}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:opacity-80"
        style={{
          backgroundColor: theme.surfaceBg,
          border: `1px solid ${theme.cardBorder}`,
          color: theme.textSecondary,
        }}
      >
        <Lightbulb className="w-3 h-3" />
        Tips
      </button>
    ) : null
  );

  // Settled state
  if (isSettled && fight.winner) {
    const winnerName = fight.winner === "fighter_a" ? nameA : nameB;
    return (
      <div className="rounded-2xl p-5" style={cardStyle}>
        {sportLeagueLabel && (
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: theme.textMuted }}>
            {sportLeagueLabel}
          </div>
        )}
        <div className="text-center mb-3">
          <span className="text-xs font-bold text-green-500 uppercase tracking-wider">{t("operator.result")}</span>
        </div>
        <p className="text-center text-lg font-bold mb-1" style={{ color: theme.textPrimary }}>
          {winnerName} {t("operator.wins")}
        </p>
        {userPicked && (
          <div className="text-center mt-3">
            {userWon ? (
              <>
                <p className="text-green-500 font-bold text-sm">{t("operator.youWon")}</p>
                {!userEntry?.claimed && onClaim && (
                  <button
                    onClick={() => onClaim(fight.id)}
                    disabled={claiming}
                    className="mt-2 px-6 py-2 rounded-xl font-bold text-sm transition-all"
                    style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
                  >
                    {claiming ? t("operator.claiming") : t("operator.collectWinnings")}
                  </button>
                )}
                {userEntry?.claimed && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs" style={{ color: theme.textMuted }}>{t("operator.winningsCollected")}</p>
                    {onShareWin && !winShared && (
                      <button
                        onClick={() => { onShareWin(fight); setWinShared(true); }}
                        className="px-5 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-80"
                        style={{ border: `1px solid ${theme.cardBorder}`, color: theme.textPrimary }}
                      >
                        🏆 {t("operator.shareYourWin")}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-red-400/70 text-sm">{t("operator.betterLuck")}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // User already placed a prediction
  if (userPicked) {
    const pickedName = userPicked === "fighter_a" ? nameA : nameB;
    return (
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {sportLeagueLabel && (
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                {sportLeagueLabel}
              </div>
            )}
            {liveState && (liveState.live || liveState.ended) && (
              <LiveGameBadge state={liveState} theme={theme} />
            )}
          </div>
          <div className="flex items-center gap-1">
            <TipsButton />
            <GraphButton />
          </div>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {logoA && <img src={logoA} className="w-6 h-6 object-contain" alt="" />}
            <span className="text-base font-bold" style={{ color: theme.textPrimary }}>{nameA}</span>
          </div>
          {liveState && liveState.live && liveState.score ? (
            <LiveScoreDisplay state={liveState} theme={theme} />
          ) : (
            <span className="text-xs font-bold" style={{ color: theme.textMuted }}>{t("operator.vs")}</span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold" style={{ color: theme.textPrimary }}>{nameB}</span>
            {logoB && <img src={logoB} className="w-6 h-6 object-contain" alt="" />}
          </div>
        </div>
        {eventDateStr && (
          <p className="text-xs text-center mb-2" style={{ color: theme.textMuted }}>{eventDateStr}</p>
        )}
        <div className="text-center rounded-xl py-3 px-4" style={{ backgroundColor: theme.surfaceBg }}>
           <p className="text-sm" style={{ color: theme.textSecondary }}>{t("operator.yourPick")}</p>
           <p className="text-lg font-bold" style={{ color: theme.textPrimary }}>🎯 {pickedName}</p>
          {userEntry?.amount_usd && (
            <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
              {t("operator.amountPlacedLabel", { amount: userEntry.amount_usd.toFixed(2) })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Open for predictions
  const gridCols = hasDrawOption ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="rounded-2xl p-5 space-y-3" style={cardStyle}>
      {/* Sport + League badge + time + Graph */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sportLeagueLabel && (
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
              {sportLeagueLabel}
            </div>
          )}
          {liveState && (liveState.live || liveState.ended) ? (
            <LiveGameBadge state={liveState} theme={theme} />
          ) : timeLabel ? (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: theme.primary + "18",
                color: theme.primary,
              }}
            >
              {timeLabel.text}
            </span>
          ) : null}
        </div>
        <GraphButton />
      </div>

      {/* Team names */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          {logoA && <img src={logoA} className="w-8 h-8 object-contain" alt="" />}
          <span className="text-lg font-bold leading-tight" style={{ color: theme.textPrimary }}>{nameA}</span>
        </div>
        <span className="text-sm font-bold mx-3" style={{ color: theme.textMuted }}>
          {liveState && liveState.live && liveState.score ? (
            <LiveScoreDisplay state={liveState} theme={theme} />
          ) : (
            t("operator.vs")
          )}
        </span>
        <div className="flex items-center gap-3 flex-1 justify-end text-right">
          <span className="text-lg font-bold leading-tight" style={{ color: theme.textPrimary }}>{nameB}</span>
          {logoB && <img src={logoB} className="w-8 h-8 object-contain" alt="" />}
        </div>
      </div>

      {/* Event date */}
      {eventDateStr && (
        <p className="text-xs text-center" style={{ color: theme.textMuted }}>{eventDateStr}</p>
      )}

      {/* Pick buttons */}
      <div className={`grid ${gridCols} gap-3`}>
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_a")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: theme.surfaceBg,
            border: `1px solid ${theme.cardBorder}`,
          }}
        >
          <span className="block text-sm font-bold" style={{ color: theme.textPrimary }}>{nameA}</span>
          <span className="block text-xs mt-1" style={{ color: theme.primary }}>
            {t("operator.predictReturn", { predict: 10, return: payoutA.toFixed(2) })}
          </span>
          <span className="block text-[10px] mt-0.5" style={{ color: theme.textMuted }}>({multiplierA}x)</span>
        </button>
        {hasDrawOption && (
          <button
            onClick={() => isOpen && onPredict(fight, "draw")}
            disabled={!isOpen}
            className="rounded-xl py-3 px-2 text-center transition-all hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: theme.surfaceBg,
              border: `1px solid ${theme.cardBorder}`,
            }}
          >
            <span className="block text-sm font-bold" style={{ color: theme.textPrimary }}>{t("operator.draw")}</span>
            <span className="block text-xs mt-1" style={{ color: theme.textMuted }}>{t("operator.available")}</span>
          </button>
        )}
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_b")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: theme.surfaceBg,
            border: `1px solid ${theme.cardBorder}`,
          }}
        >
          <span className="block text-sm font-bold" style={{ color: theme.textPrimary }}>{nameB}</span>
          <span className="block text-xs mt-1" style={{ color: theme.primary }}>
            {t("operator.predictReturn", { predict: 10, return: payoutB.toFixed(2) })}
          </span>
          <span className="block text-[10px] mt-0.5" style={{ color: theme.textMuted }}>({multiplierB}x)</span>
        </button>
      </div>

      {/* Total pool */}
      {(() => {
        const total = (fight.pool_a_usd ?? 0) + (fight.pool_b_usd ?? 0);
        if (total <= 0) return null;
        return (
          <p className="text-center text-[11px]" style={{ color: theme.textMuted }}>
            {t("operator.totalPool")}: ${total >= 1000 ? `${(total / 1000).toFixed(0)}K` : total.toFixed(0)}
          </p>
        );
      })()}
    </div>
  );
}
