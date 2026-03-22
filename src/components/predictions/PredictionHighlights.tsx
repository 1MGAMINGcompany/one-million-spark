import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Swords, Trophy, Lock, Radio, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Fight } from "./FightCard";

export interface PredictionEvent {
  id: string;
  event_name: string;
  organization: string | null;
  event_date: string | null;
  location: string | null;
  status: string;
  is_test: boolean;
  source_provider?: string | null;
}

interface HighlightFight extends Fight {
  eventLabel?: string;
}

type Section = "live" | "today" | "upcoming";

function getStatusBadge(status: string) {
  switch (status) {
    case "open":
      return { label: "Open", className: "bg-green-500/20 text-green-400" };
    case "locked":
      return { label: "Locked", className: "bg-yellow-500/20 text-yellow-400" };
    case "live":
      return { label: "Live Now", className: "bg-red-500/20 text-red-400 animate-pulse" };
    case "confirmed":
    case "result_selected":
      return { label: "Result Pending", className: "bg-orange-500/20 text-orange-400" };
    case "settled":
      return { label: "Finished", className: "bg-muted text-muted-foreground" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground" };
  }
}

function getButtonState(status: string): { disabled: boolean; label: string } {
  switch (status) {
    case "open":
      return { disabled: false, label: "Predict" };
    case "locked":
      return { disabled: true, label: "Predictions Closed" };
    case "live":
      return { disabled: true, label: "Live Now" };
    case "confirmed":
    case "result_selected":
    case "settled":
      return { disabled: true, label: "Finished" };
    default:
      return { disabled: true, label: "Unavailable" };
  }
}

/** Detect if Polymarket prices are in resolving state (exactly 0/1) */
function isResolvingPrice(priceA?: number | null, priceB?: number | null, source?: string | null): boolean {
  if (source !== "polymarket") return false;
  const a = priceA ?? 0;
  const b = priceB ?? 0;
  return (a === 0 && b === 1) || (a === 1 && b === 0) || (a === 0 && b === 0);
}

function calcOdds(poolA: number, poolB: number, priceA?: number | null, priceB?: number | null, source?: string | null) {
  // If prices are exactly 0/1 for Polymarket, treat as resolving — don't show misleading odds
  if (isResolvingPrice(priceA, priceB, source)) {
    return { oddsA: 0, oddsB: 0, noData: false, resolving: true };
  }
  if (priceA && priceA > 0 && priceB && priceB > 0) {
    return { oddsA: +(1 / priceA).toFixed(2), oddsB: +(1 / priceB).toFixed(2), noData: false, resolving: false };
  }
  if (priceA && priceA > 0 && priceA <= 1) {
    const dB = 1 - priceA;
    return { oddsA: +(1 / priceA).toFixed(2), oddsB: dB > 0 ? +(1 / dB).toFixed(2) : 0, noData: false, resolving: false };
  }
  if (priceB && priceB > 0 && priceB <= 1) {
    const dA = 1 - priceB;
    return { oddsA: dA > 0 ? +(1 / dA).toFixed(2) : 0, oddsB: +(1 / priceB).toFixed(2), noData: false, resolving: false };
  }
  const total = poolA + poolB;
  if (total === 0) return { oddsA: 0, oddsB: 0, noData: source === "polymarket", resolving: false };
  return {
    oddsA: poolA > 0 ? +(total / poolA).toFixed(2) : 0,
    oddsB: poolB > 0 ? +(total / poolB).toFixed(2) : 0,
    noData: false,
    resolving: false,
  };
}

/** Get USD pool — prefers new columns, falls back to legacy */
function getPoolUsd(fight: Fight): number {
  if ((fight.pool_a_usd ?? 0) > 0 || (fight.pool_b_usd ?? 0) > 0) {
    return (fight.pool_a_usd ?? 0) + (fight.pool_b_usd ?? 0);
  }
  return (fight.pool_a_lamports + fight.pool_b_lamports) / 1_000_000_000;
}

function HighlightCard({
  fight,
  onPredict,
  compact,
}: {
  fight: HighlightFight;
  onPredict?: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  compact?: boolean;
}) {
  const poolA = (fight.pool_a_usd ?? 0) > 0 ? fight.pool_a_usd! : fight.pool_a_lamports / 1_000_000_000;
  const poolB = (fight.pool_b_usd ?? 0) > 0 ? fight.pool_b_usd! : fight.pool_b_lamports / 1_000_000_000;
  const { oddsA, oddsB, noData } = calcOdds(poolA, poolB, fight.price_a, fight.price_b, fight.source);
  const totalPool = poolA + poolB;
  const isPolymarketPool = fight.source === "polymarket" && totalPool === 0;
  const badge = getStatusBadge(fight.status);
  const btn = getButtonState(fight.status);

  return (
    <Card className="bg-card border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {fight.eventLabel && (
            <p className="text-[10px] text-muted-foreground truncate">{fight.eventLabel}</p>
          )}
          <h3 className="text-xs font-bold text-foreground font-['Cinzel'] truncate">
            {fight.fighter_a_name} vs {fight.fighter_b_name}
          </h3>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Odds + Buttons */}
      <div className="p-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" dir="ltr">
          <div className="text-center">
            <p className="text-xs font-bold text-foreground truncate">{fight.fighter_a_name}</p>
            <p className="text-primary font-bold text-sm">{oddsA > 0 ? `${oddsA.toFixed(2)}x` : '—'}</p>
            {!btn.disabled && onPredict && (
              <Button
                size="sm"
                className="mt-1 w-full text-[10px] h-7 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onPredict(fight, "fighter_a")}
              >
                Predict
              </Button>
            )}
          </div>
          <div className="flex flex-col items-center">
            <Swords className="w-4 h-4 text-primary/60" />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-foreground truncate">{fight.fighter_b_name}</p>
            <p className="text-primary font-bold text-sm">{oddsB > 0 ? `${oddsB.toFixed(2)}x` : '—'}</p>
            {!btn.disabled && onPredict && (
              <Button
                size="sm"
                className="mt-1 w-full text-[10px] h-7 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onPredict(fight, "fighter_b")}
              >
                Predict
              </Button>
            )}
          </div>
        </div>

        {/* Disabled state message */}
        {btn.disabled && (
          <div className="mt-2 text-center">
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1 rounded-full ${
              fight.status === "live"
                ? "bg-red-500/10 text-red-400"
                : fight.status === "locked"
                ? "bg-yellow-500/10 text-yellow-400"
                : "bg-muted/50 text-muted-foreground"
            }`}>
              {fight.status === "live" && <Radio className="w-3 h-3" />}
              {fight.status === "locked" && <Lock className="w-3 h-3" />}
              {btn.label}
            </span>
          </div>
        )}

        {/* Pool */}
        <div className="mt-2 pt-1.5 border-t border-border/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{isPolymarketPool ? "Liquidity" : "Pool"}</span>
          <span className="text-[11px] font-bold text-primary">
            {isPolymarketPool ? "Polymarket" : `$${totalPool.toFixed(2)}`}
          </span>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({
  section,
  count,
}: {
  section: Section;
  count: number;
}) {
  const config = {
    live: {
      icon: <Radio className="w-4 h-4" />,
      label: "LIVE NOW",
      className: "text-red-400",
      dotClassName: "bg-red-400 animate-pulse",
    },
    today: {
      icon: <Clock className="w-4 h-4" />,
      label: "TODAY",
      className: "text-primary",
      dotClassName: "",
    },
    upcoming: {
      icon: <Trophy className="w-4 h-4" />,
      label: "UPCOMING",
      className: "text-muted-foreground",
      dotClassName: "",
    },
  }[section];

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={config.className}>{config.icon}</span>
      <h3 className={`text-sm font-bold uppercase tracking-wider ${config.className}`}>
        {config.label}
      </h3>
      {config.dotClassName && <span className={`w-2 h-2 rounded-full ${config.dotClassName}`} />}
      <span className="text-[10px] text-muted-foreground">({count})</span>
    </div>
  );
}

export default function PredictionHighlights({
  fights,
  events,
  onPredict,
  showViewAll = false,
  onWalletRequired,
  wallet,
}: {
  fights: Fight[];
  events: PredictionEvent[];
  onPredict?: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  showViewAll?: boolean;
  onWalletRequired?: () => void;
  wallet?: string | null;
}) {
  const eventMap = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const enrichedFights: HighlightFight[] = useMemo(() => {
    return fights
      .filter((f) => !["draw", "refund_pending", "refunds_processing", "refunds_complete", "cancelled"].includes(f.status))
      .map((f) => {
        const ev = f.event_id ? eventMap.get(f.event_id) : undefined;
        return {
          ...f,
          eventLabel: ev?.event_name || f.event_name,
        };
      });
  }, [fights, eventMap]);

  const isToday = (dateStr: string | null | undefined) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const prioritySort = (a: HighlightFight, b: HighlightFight) => {
    const PRIORITY_NAMES = ["Josh Emmett", "Kevin Vallejos"];
    const aIsPriority = PRIORITY_NAMES.some(n => a.fighter_a_name.includes(n) || a.fighter_b_name.includes(n));
    const bIsPriority = PRIORITY_NAMES.some(n => b.fighter_a_name.includes(n) || b.fighter_b_name.includes(n));
    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;
    return 0;
  };

  const { liveFights, todayFights, upcomingFights } = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = now.toDateString();
    const live: HighlightFight[] = [];
    const today: HighlightFight[] = [];
    const upcoming: HighlightFight[] = [];

    enrichedFights.forEach((f) => {
      const ev = f.event_id ? eventMap.get(f.event_id) : undefined;
      const eventDate = ev?.event_date || null;
      const eventMs = eventDate ? new Date(eventDate).getTime() : null;

      if (f.status === "live") {
        if (eventMs != null && (nowMs - eventMs) > 24 * 60 * 60 * 1000) {
          // Stale live — skip
        } else {
          live.push(f);
        }
      } else if (f.status === "open" || f.status === "locked") {
        const hasStarted = eventMs != null && eventMs <= nowMs;
        const eventLocalDate = eventMs != null ? new Date(eventMs).toDateString() : null;
        const isEventToday = eventLocalDate === todayStr;

        if (hasStarted) {
          if (isEventToday) {
            today.push(f);
          }
        } else if (eventMs == null) {
          upcoming.push(f);
        } else if (isEventToday) {
          today.push(f);
        } else {
          upcoming.push(f);
        }
      }
    });

    return {
      liveFights: live.sort(prioritySort),
      todayFights: today.sort(prioritySort),
      upcomingFights: upcoming.sort(prioritySort),
    };
  }, [enrichedFights, eventMap]);

  const handlePredict = (fight: Fight, pick: "fighter_a" | "fighter_b") => {
    if (!wallet) {
      onWalletRequired?.();
      return;
    }
    onPredict?.(fight, pick);
  };

  const hasContent = liveFights.length > 0 || todayFights.length > 0 || upcomingFights.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-6">
      {liveFights.length > 0 && (
        <div>
          <SectionHeader section="live" count={liveFights.length} />
          <div className="grid gap-3 sm:grid-cols-2">
            {liveFights.map((f) => (
              <HighlightCard key={f.id} fight={f} />
            ))}
          </div>
        </div>
      )}

      {todayFights.length > 0 && (
        <div>
          <SectionHeader section="today" count={todayFights.length} />
          <div className="grid gap-3 sm:grid-cols-2">
            {todayFights.map((f) => (
              <HighlightCard key={f.id} fight={f} onPredict={handlePredict} />
            ))}
          </div>
        </div>
      )}

      {upcomingFights.length > 0 && (
        <div>
          <SectionHeader section="upcoming" count={upcomingFights.length} />
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingFights.map((f) => (
              <HighlightCard key={f.id} fight={f} onPredict={handlePredict} />
            ))}
          </div>
        </div>
      )}

      {showViewAll && (
        <div className="text-center">
          <Button asChild variant="outline" size="sm" className="border-primary/30">
            <Link to="/predictions">View All Predictions →</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
