import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Lightbulb, Flame, Clock } from "lucide-react";
import { getTeamLogo } from "@/lib/teamLogos";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import { formatEventDateTime } from "@/lib/formatEventLocalDateTime";
import type { Fight } from "@/components/predictions/FightCard";
import { useLiveGameState } from "@/hooks/useSportsWebSocket";
import LiveGameBadge from "@/components/predictions/LiveGameBadge";
import type { OperatorTheme } from "@/lib/operatorThemes";

interface SimplePredictionCardProps {
  fight: Fight & { _broadSport?: string; _league?: string };
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b" | "draw") => void;
  userEntry?: { fighter_pick: string; amount_usd: number | null; claimed: boolean; reward_usd?: number | null; polymarket_status?: string | null; polymarket_order_id?: string | null } | null;
  onClaim?: (fightId: string) => void;
  claiming?: boolean;
  theme: OperatorTheme;
  onShareWin?: (fight: Fight) => void;
  onGraph?: (fight: Fight) => void;
  onTips?: (fight: Fight) => void;
  onSell?: (fightId: string) => void;
  selling?: boolean;
}

function getTimeLabel(eventDate: string | null | undefined, t: (key: string, opts?: any) => string): { text: string; isUrgent: boolean } | null {
  if (!eventDate) return null;
  const d = new Date(eventDate);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff < 0) return null;
  const mins = Math.round(diff / 60000);
  if (mins < 15) return { text: `⏳ ${t("operator.startsInMin", { min: Math.max(1, mins) })}`, isUrgent: true };
  if (diff < 3600000) return { text: t("operator.startsInMin", { min: mins }), isUrgent: false };
  if (diff < 86400000) return { text: t("operator.startsInHour", { hour: Math.round(diff / 3600000) }), isUrgent: false };
  if (diff < 172800000) return { text: t("operator.tomorrow"), isUrgent: false };
  return null;
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

/** Format sport-specific live state line */
function formatLiveDetail(liveState: { period?: string; elapsed?: string; sport?: string; status?: string } | null, t: (k: string, o?: any) => string): string | null {
  if (!liveState) return null;
  const { period, elapsed, sport, status } = liveState;
  if (!period && !elapsed) return null;
  const s = (sport || "").toLowerCase();
  const st = (status || "").toLowerCase();

  if (st === "halftime" || st === "ht" || st === "break") return t("operator.liveHalftime");

  if (s.includes("hockey") || s.includes("nhl") || s.includes("ice")) {
    const p = period?.startsWith("P") ? period : `P${period}`;
    return elapsed ? `${p} • ${elapsed}` : p;
  }
  if (s.includes("basketball") || s.includes("nba")) {
    const q = period?.startsWith("Q") ? period : `Q${period}`;
    return elapsed ? `${q} • ${elapsed}` : q;
  }
  if (s.includes("soccer") || s.includes("football") || s.includes("futbol") || s.includes("epl") || s.includes("mls") || s.includes("laliga") || s.includes("bundesliga") || s.includes("serie") || s.includes("ligue")) {
    return elapsed ? `${elapsed}'` : period || null;
  }
  if (s.includes("baseball") || s.includes("mlb")) {
    if (period && elapsed) return `${period} ${elapsed}`;
    return period || elapsed || null;
  }
  if (s.includes("mma") || s.includes("ufc") || s.includes("boxing") || s.includes("fight")) {
    const r = period ? `${t("operator.liveRound")}${period}` : "";
    return elapsed ? `${r} • ${elapsed}` : r || null;
  }
  if (s.includes("tennis")) return period ? `${t("operator.liveSet")} ${period}` : null;

  if (period && elapsed) return `${period} • ${elapsed}`;
  return period || elapsed || null;
}

export default function SimplePredictionCard({
  fight, onPredict, userEntry, onClaim, claiming, theme, onShareWin, onGraph, onTips, onSell, selling,
}: SimplePredictionCardProps) {
  const { t } = useTranslation();
  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);
  const { priceA, priceB } = getOddsFromFight(fight);
  const multiplierA = priceA > 0 ? (1 / priceA) : 0;
  const multiplierB = priceB > 0 ? (1 / priceB) : 0;
  const impliedA = Math.round(priceA * 100);
  const impliedB = Math.round(priceB * 100);
  const splitA = Math.round((priceA / (priceA + priceB || 1)) * 100);

  const liveState = useLiveGameState((fight as any).polymarket_slug);

  // Prefer DB-stored photos/logos over ESPN CDN lookups (which may be blocked by CORS)
  const dbLogoA = (fight as any).home_logo || (fight as any).fighter_a_photo || null;
  const dbLogoB = (fight as any).away_logo || (fight as any).fighter_b_photo || null;
  const fallbackA = getTeamLogo(nameA, fight.event_name);
  const fallbackB = getTeamLogo(nameB, fight.event_name);
  const logoA = dbLogoA || fallbackA?.url || null;
  const logoB = dbLogoB || fallbackB?.url || null;

  const hasDrawOption = !!(fight as any).draw_allowed;
  const isStarted = (fight as any).event_date && new Date((fight as any).event_date).getTime() < Date.now();
  const isPolymarket = !!(fight as any).polymarket_slug;
  const isOpen = fight.status === "open" || fight.status === "live" || (fight.status === "locked" && isStarted && isPolymarket);
  const isSettled = ["settled", "confirmed", "result_selected"].includes(fight.status);
  const userPicked = userEntry?.fighter_pick;
  const userWon = isSettled && fight.winner === userPicked;
  const [winShared, setWinShared] = useState(false);

  const eventDateStr = (fight as any).event_date ? formatEventDateTime((fight as any).event_date) : null;
  const leagueName = (fight as any)._league || fight.event_name?.split(" — ")[0] || fight.event_name;
  const broadSportLabel = (fight as any)._broadSport && (fight as any)._broadSport !== "OTHER"
    ? ((fight as any)._broadSport as string).charAt(0) + ((fight as any)._broadSport as string).slice(1).toLowerCase()
    : null;
  const sportLeagueLabel = broadSportLabel && leagueName && leagueName !== "Other"
    ? `${broadSportLabel.toUpperCase()} • ${leagueName}`
    : broadSportLabel ? broadSportLabel.toUpperCase() : leagueName;
  const timeLabel = getTimeLabel((fight as any).event_date, t);

  const isLive = !!(liveState && liveState.live);
  const isEnded = !!(liveState && liveState.ended);
  const liveDetailText = formatLiveDetail(liveState, t);

  const totalPool = (fight.pool_a_usd ?? 0) + (fight.pool_b_usd ?? 0);

  const cardStyle: React.CSSProperties = {
    backgroundColor: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    ...(isLive ? { boxShadow: `0 0 12px 0 ${theme.primary}15` } : {}),
  };

  const volume = (fight as any).polymarket_volume_usd ?? 0;
  const isHotVolume = volume >= 50_000;

  const ActionButtons = () => (
    <div className="flex items-center gap-1">
      {onTips && (
        <button onClick={(e) => { e.stopPropagation(); onTips(fight); }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all hover:opacity-80"
          style={{ backgroundColor: theme.primary + "18", border: `1px solid ${theme.primary}33`, color: theme.primary }}>
          <Lightbulb className="w-3 h-3" /> {t("operator.smartPlay")}
        </button>
      )}
      {onGraph && (
        <button onClick={(e) => { e.stopPropagation(); onGraph(fight); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:opacity-80"
          style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}`, color: theme.textSecondary }}>
          <BarChart3 className="w-3 h-3" /> {t("operator.graph")}
        </button>
      )}
    </div>
  );

  // ── SETTLED STATE ──
  if (isSettled && fight.winner) {
    const winnerName = fight.winner === "fighter_a" ? nameA : nameB;
    const isPolymarketFight = !!(fight as any).polymarket_market_id;
    const hasNoRealOrder = isPolymarketFight && userPicked && !userEntry?.polymarket_order_id;
    const isNotExecuted = userEntry?.polymarket_status === "not_executed";
    const orderNeverExecuted = hasNoRealOrder || isNotExecuted;

    return (
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        {sportLeagueLabel && (
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: theme.textMuted }}>{sportLeagueLabel}</div>
        )}
        <div className="text-center mb-3">
          <span className="text-xs font-bold text-green-500 uppercase tracking-wider">{t("operator.result")}</span>
        </div>
        <p className="text-center text-lg font-bold mb-1" style={{ color: theme.textPrimary }}>
          {winnerName} {t("operator.wins")}
        </p>
        {userPicked && (
          <div className="text-center mt-3">
            {orderNeverExecuted ? (
              <>
                <p className="text-amber-400 font-bold text-sm">⚠️ {t("operator.tradeNotExecuted")}</p>
                <p className="text-xs mt-1" style={{ color: theme.textMuted }}>{t("operator.noFundsCommitted")}</p>
              </>
            ) : userWon ? (
              <>
                <p className="text-green-500 font-bold text-sm">{t("operator.youWon")}</p>
                {userEntry?.reward_usd != null && userEntry.reward_usd > 0 && (
                  <p className="text-green-400 text-lg font-bold mt-1">+${userEntry.reward_usd.toFixed(2)}</p>
                )}
                {!userEntry?.claimed && onClaim && (
                  <button onClick={() => onClaim(fight.id)} disabled={claiming}
                    className="mt-2 px-6 py-2 rounded-xl font-bold text-sm transition-all animate-pulse hover:animate-none"
                    style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}>
                    {claiming ? t("operator.claiming") : `${t("operator.collectWinnings")}${userEntry?.reward_usd ? ` (+$${userEntry.reward_usd.toFixed(2)})` : ""}`}
                  </button>
                )}
                {userEntry?.claimed && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs" style={{ color: theme.textMuted }}>{t("operator.winningsCollected")}</p>
                    {onShareWin && !winShared && (
                      <button onClick={() => { onShareWin(fight); setWinShared(true); }}
                        className="px-5 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-80"
                        style={{ border: `1px solid ${theme.cardBorder}`, color: theme.textPrimary }}>
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

  // ── USER ALREADY PICKED ──
  if (userPicked) {
    const pickedName = userPicked === "fighter_a" ? nameA : nameB;
    return (
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {sportLeagueLabel && (
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>{sportLeagueLabel}</div>
            )}
            {liveState && (liveState.live || liveState.ended) && <LiveGameBadge state={liveState} theme={theme} />}
          </div>
          <ActionButtons />
        </div>

        {/* Live score prominently */}
        {isLive && liveState?.score && (
          <LiveScoreBlock nameA={nameA} nameB={nameB} liveState={liveState} liveDetailText={liveDetailText} theme={theme} />
        )}

        {/* Teams (when no live score) */}
        {(!isLive || !liveState?.score) && (
          <div className="flex items-center justify-between mb-3 mt-1">
            <TeamLabel name={nameA} logo={logoA} theme={theme} />
            <span className="text-xs font-bold mx-2 shrink-0" style={{ color: theme.textMuted }}>{t("operator.vs")}</span>
            <TeamLabel name={nameB} logo={logoB} theme={theme} align="right" />
          </div>
        )}

        {eventDateStr && !isLive && (
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
          {isOpen && onSell && userEntry?.polymarket_order_id && (
            <button onClick={() => onSell(fight.id)} disabled={selling}
              className="mt-3 px-5 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-80"
              style={{ backgroundColor: "transparent", border: `1.5px solid ${theme.primary}`, color: theme.primary }}>
              {selling ? t("operator.selling") : t("operator.sellPosition")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── OPEN FOR PREDICTIONS ──
  const gridCols = hasDrawOption ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="rounded-2xl p-4 sm:p-5 space-y-2.5" style={cardStyle}>
      {/* Row 1: Sport + League + Status badges */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {sportLeagueLabel && (
            <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: theme.textMuted }}>
              {sportLeagueLabel}
            </span>
          )}
          {liveState && (liveState.live || liveState.ended) ? (
            <LiveGameBadge state={liveState} theme={theme} />
          ) : timeLabel ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={{ backgroundColor: timeLabel.isUrgent ? "#ef444422" : theme.primary + "18", color: timeLabel.isUrgent ? "#ef4444" : theme.primary }}>
              {timeLabel.text}
            </span>
          ) : null}
          {isLive && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ backgroundColor: "#f9731622", color: "#f97316" }}>
              <Flame className="w-2.5 h-2.5" /> {t("operator.hotMarket")}
            </span>
          )}
        </div>
        <ActionButtons />
      </div>

      {/* Row 2: LIVE score block (prominent, above everything else) */}
      {isLive && liveState?.score && (
        <LiveScoreBlock nameA={nameA} nameB={nameB} liveState={liveState} liveDetailText={liveDetailText} theme={theme} />
      )}

      {/* Row 3: Teams (shown when NOT live or no score) */}
      {(!isLive || !liveState?.score) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {logoA && <img src={logoA} className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
            <span className="text-base sm:text-lg font-bold leading-tight truncate" style={{ color: theme.textPrimary }}>{nameA}</span>
          </div>
          <span className="text-sm font-bold mx-2 shrink-0" style={{ color: theme.textMuted }}>{t("operator.vs")}</span>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <span className="text-base sm:text-lg font-bold leading-tight truncate text-right" style={{ color: theme.textPrimary }}>{nameB}</span>
            {logoB && <img src={logoB} className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
          </div>
        </div>
      )}

      {/* Row 4: Event date (only non-live) */}
      {!isLive && eventDateStr && (
        <p className="text-xs text-center" style={{ color: theme.textMuted }}>{eventDateStr}</p>
      )}

      {/* Row 5: Pick buttons — multiplier + implied probability */}
      <div className={`grid ${gridCols} gap-2`}>
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_a")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}>
          <span className="block text-xs sm:text-sm font-bold truncate" style={{ color: theme.textPrimary }}>{nameA}</span>
          <span className="block text-xl font-black mt-0.5" style={{ color: theme.primary }}>
            {multiplierA > 0 ? `${multiplierA.toFixed(2)}x` : "—"}
          </span>
          {impliedA > 0 && (
            <span className="block text-[10px] mt-0.5" style={{ color: theme.textMuted }}>
              {t("operator.implied")}: {impliedA}%
            </span>
          )}
        </button>
        {hasDrawOption && (
          <button onClick={() => isOpen && onPredict(fight, "draw")} disabled={!isOpen}
            className="rounded-xl py-3 px-2 text-center transition-all hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}>
            <span className="block text-xs sm:text-sm font-bold" style={{ color: theme.textPrimary }}>{t("operator.draw")}</span>
            <span className="block text-xs mt-1" style={{ color: theme.textMuted }}>{t("operator.available")}</span>
          </button>
        )}
        <button
          onClick={() => isOpen && onPredict(fight, "fighter_b")}
          disabled={!isOpen}
          className="rounded-xl py-3 px-2 text-center transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}>
          <span className="block text-xs sm:text-sm font-bold truncate" style={{ color: theme.textPrimary }}>{nameB}</span>
          <span className="block text-xl font-black mt-0.5" style={{ color: theme.primary }}>
            {multiplierB > 0 ? `${multiplierB.toFixed(2)}x` : "—"}
          </span>
          {impliedB > 0 && (
            <span className="block text-[10px] mt-0.5" style={{ color: theme.textMuted }}>
              {t("operator.implied")}: {impliedB}%
            </span>
          )}
        </button>
      </div>

      {/* Row 6: Market split bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-medium" style={{ color: theme.textMuted }}>
          <span>{nameA} {splitA}%</span>
          <span>{t("operator.marketSplit")}</span>
          <span>{nameB} {100 - splitA}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.surfaceBg }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${splitA}%`, backgroundColor: theme.primary }} />
        </div>
      </div>

      {/* Row 7: Total pool + Hot badge */}
      <div className="flex items-center justify-center gap-2">
        {totalPool > 0 && (
          <p className="text-[11px]" style={{ color: theme.textMuted }}>
            {t("operator.totalPool")}: ${totalPool >= 1000 ? `${(totalPool / 1000).toFixed(0)}K` : totalPool.toFixed(0)}
          </p>
        )}
        {isHotVolume && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: theme.primary + "18", color: theme.primary }}>
            🔥 {t("operator.mostTraded")}
          </span>
        )}
      </div>

      {/* Sell reminder line */}
      <p className="text-center text-[10px]" style={{ color: theme.textMuted }}>
        💡 {t("operator.sellReminder")}
      </p>
    </div>
  );
}

// ── Sub-components ──

function TeamLabel({ name, logo, theme, align = "left" }: { name: string; logo: string | null; theme: OperatorTheme; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${align === "right" ? "justify-end" : ""}`}>
      {align === "left" && logo && <img src={logo} className="w-6 h-6 object-contain shrink-0" alt="" onError={e => { (e.currentTarget).style.display = 'none'; }} />}
      <span className={`text-sm font-bold truncate ${align === "right" ? "text-right" : ""}`} style={{ color: theme.textPrimary }}>{name}</span>
      {align === "right" && logo && <img src={logo} className="w-6 h-6 object-contain shrink-0" alt="" onError={e => { (e.currentTarget).style.display = 'none'; }} />}
    </div>
  );
}

function LiveScoreBlock({ nameA, nameB, liveState, liveDetailText, theme }: {
  nameA: string; nameB: string;
  liveState: { score?: string; scoreA?: number; scoreB?: number };
  liveDetailText: string | null;
  theme: OperatorTheme;
}) {
  const sA = liveState.scoreA ?? 0;
  const sB = liveState.scoreB ?? 0;

  return (
    <div className="text-center py-2 px-3 rounded-xl" style={{ backgroundColor: "#ef444408", border: "1px solid #ef444415" }}>
      <div className="flex items-center justify-center gap-3">
        <span className="text-sm font-bold truncate max-w-[30%]" style={{ color: theme.textPrimary }}>{nameA}</span>
        <span className="text-2xl font-black font-mono tabular-nums" style={{ color: theme.textPrimary }}>
          {sA} <span style={{ color: theme.textMuted }}>—</span> {sB}
        </span>
        <span className="text-sm font-bold truncate max-w-[30%]" style={{ color: theme.textPrimary }}>{nameB}</span>
      </div>
      {liveDetailText && (
        <div className="text-[10px] font-mono mt-0.5" style={{ color: theme.textMuted }}>{liveDetailText}</div>
      )}
    </div>
  );
}
