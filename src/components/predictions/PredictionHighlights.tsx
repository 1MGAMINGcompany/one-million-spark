import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Swords, Trophy, Lock, Radio, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSolPrice } from "@/hooks/useSolPrice";
import type { Fight } from "./FightCard";

const LAMPORTS = 1_000_000_000;

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

function calcOdds(poolA: number, poolB: number) {
  const total = poolA + poolB;
  if (total === 0) return { oddsA: 2.0, oddsB: 2.0 };
  return {
    oddsA: poolA > 0 ? total / poolA : 0,
    oddsB: poolB > 0 ? total / poolB : 0,
  };
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
  const { formatUsd } = useSolPrice();
  const { oddsA, oddsB } = calcOdds(fight.pool_a_lamports, fight.pool_b_lamports);
  const totalPool = (fight.pool_a_lamports + fight.pool_b_lamports) / LAMPORTS;
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
            <p className="text-primary font-bold text-sm">{oddsA.toFixed(2)}x</p>
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
            <p className="text-primary font-bold text-sm">{oddsB.toFixed(2)}x</p>
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
          <span className="text-[10px] text-muted-foreground">Pool</span>
          <span className="text-[11px] font-bold text-primary">
            {totalPool.toFixed(2)} SOL
            {formatUsd(totalPool) && (
              <span className="text-[10px] text-muted-foreground font-normal ml-1">{formatUsd(totalPool)}</span>
            )}
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

  const isFuture = (dateStr: string | null | undefined) => {
    if (!dateStr) return true; // no date = treat as upcoming
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return d > now;
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
    const live: HighlightFight[] = [];
    const today: HighlightFight[] = [];
    const upcoming: HighlightFight[] = [];

    enrichedFights.forEach((f) => {
      const ev = f.event_id ? eventMap.get(f.event_id) : undefined;
      const eventDate = ev?.event_date || null;

      if (f.status === "live") {
        live.push(f);
      } else if (f.status === "open" || f.status === "locked") {
        if (isToday(eventDate)) {
          today.push(f);
        } else if (isFuture(eventDate)) {
          upcoming.push(f);
        } else {
          today.push(f);
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
      {/* LIVE NOW */}
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

      {/* TODAY */}
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

      {/* UPCOMING */}
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

      {/* View All CTA */}
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


