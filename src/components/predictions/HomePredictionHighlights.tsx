import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Swords, Clock, ChevronDown, Lock } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { parseSport } from "@/components/predictions/EventSection";
import type { Fight } from "@/components/predictions/FightCard";
import type { PredictionEvent } from "@/components/predictions/PredictionHighlights";
import { formatEventDateTime } from "@/lib/formatEventLocalDateTime";

import muayThaiImg from "@/assets/muay-thai.png";
import boxingGloveImg from "@/assets/boxing-glove.png";
import mmaGlovesImg from "@/assets/mma-gloves.png";
import futbolImg from "@/assets/futbol.png";
import bareKnuckleImg from "@/assets/bare-knuckle.png";

const SPORT_TABS = ["ALL", "MUAY THAI", "BARE KNUCKLE", "MMA", "BOXING", "FUTBOL"] as const;

const SPORT_IMG: Record<string, string> = {
  MMA: mmaGlovesImg,
  BOXING: boxingGloveImg,
  "MUAY THAI": muayThaiImg,
  "BARE KNUCKLE": bareKnuckleImg,
  FUTBOL: futbolImg,
};

/** Detect if Polymarket prices are in resolving state (exactly 0/1) */
function isResolvingPrice(priceA?: number | null, priceB?: number | null, source?: string | null): boolean {
  if (source !== "polymarket") return false;
  const a = priceA ?? 0;
  const b = priceB ?? 0;
  return (a === 0 && b === 1) || (a === 1 && b === 0) || (a === 0 && b === 0);
}

function calcOdds(poolA: number, poolB: number, priceA?: number | null, priceB?: number | null, source?: string | null) {
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

function CompactFightCard({
  fight,
  onPredict,
}: {
  fight: Fight & { eventLabel?: string };
  onPredict?: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
}) {
  const poolA = (fight.pool_a_usd ?? 0) > 0 ? fight.pool_a_usd! : fight.pool_a_lamports / 1_000_000_000;
  const poolB = (fight.pool_b_usd ?? 0) > 0 ? fight.pool_b_usd! : fight.pool_b_lamports / 1_000_000_000;
  const { oddsA, oddsB, noData, resolving } = calcOdds(poolA, poolB, fight.price_a, fight.price_b, (fight as any).source);
  const totalPool = poolA + poolB;
  const isPolymarketPool = fight.source === "polymarket" && totalPool === 0;
  const isOpen = fight.status === "open";

  return (
    <Card className="bg-card border-border/50 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {fight.eventLabel && (
            <p className="text-[10px] text-muted-foreground truncate">{fight.eventLabel}</p>
          )}
          <h3 className="text-xs font-bold text-foreground font-['Cinzel'] truncate">
            {fight.fighter_a_name} vs {fight.fighter_b_name}
          </h3>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isOpen ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
        }`}>
          {isOpen ? "Open" : "Locked"}
        </span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" dir="ltr">
          <div className="text-center">
            <p className="text-xs font-bold text-foreground truncate">{fight.fighter_a_name}</p>
            <p className="text-primary font-bold text-sm">{oddsA > 0 ? `${oddsA.toFixed(2)}x` : '—'}</p>
            {isOpen && onPredict && (
              <Button
                size="sm"
                className="mt-1 w-full text-[10px] h-7 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onPredict(fight, "fighter_a")}
              >
                Predict
              </Button>
            )}
          </div>
          <Swords className="w-4 h-4 text-primary/60" />
          <div className="text-center">
            <p className="text-xs font-bold text-foreground truncate">{fight.fighter_b_name}</p>
            <p className="text-primary font-bold text-sm">{oddsB > 0 ? `${oddsB.toFixed(2)}x` : '—'}</p>
            {isOpen && onPredict && (
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

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return formatEventDateTime(dateStr);
}

type EnrichedFight = Fight & { eventLabel?: string; eventDate?: string | null; sport: string };

export default function HomePredictionHighlights({
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
  const [activeSport, setActiveSport] = useState<string>("ALL");
  const [tabOpen, setTabOpen] = useState(false);

  const eventMap = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const enrichedFights: EnrichedFight[] = useMemo(() => {
    return fights
      .filter((f) => ["open", "locked", "live"].includes(f.status))
      .map((f) => {
        const ev = f.event_id ? eventMap.get(f.event_id) : undefined;
        return {
          ...f,
          eventLabel: ev?.event_name || f.event_name,
          eventDate: ev?.event_date || null,
          sport: parseSport(ev?.event_name || f.event_name, ev?.source_provider, (ev as any)?.category),
        };
      });
  }, [fights, eventMap]);

  const todayFights = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    return enrichedFights
      .filter((f) => {
        if (!f.eventDate) return false;
        const eventMs = new Date(f.eventDate).getTime();
        const isEventToday = new Date(eventMs).toDateString() === todayStr;
        return isEventToday;
      })
      .slice(0, 2);
  }, [enrichedFights]);

  const filtered = useMemo(() => {
    if (activeSport === "ALL") return enrichedFights;
    return enrichedFights.filter((f) => f.sport === activeSport);
  }, [enrichedFights, activeSport]);

  const dayGroups = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = now.toDateString();
    const groups = new Map<string, EnrichedFight[]>();
    filtered
      .filter((f) => {
        if (!f.eventDate) return true;
        const eventMs = new Date(f.eventDate).getTime();
        const eventLocalDate = new Date(eventMs).toDateString();
        if (eventLocalDate === todayStr) return false;
        if (eventMs <= nowMs) return false;
        return true;
      })
      .forEach((f) => {
        const key = f.eventDate
          ? new Date(f.eventDate).toDateString()
          : "Unknown";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(f);
      });
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "Unknown") return 1;
      if (b[0] === "Unknown") return -1;
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });
  }, [filtered]);

  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: enrichedFights.length };
    enrichedFights.forEach((f) => {
      counts[f.sport] = (counts[f.sport] || 0) + 1;
    });
    return counts;
  }, [enrichedFights]);

  const handlePredict = (fight: Fight, pick: "fighter_a" | "fighter_b") => {
    if (!wallet) {
      onWalletRequired?.();
      return;
    }
    onPredict?.(fight, pick);
  };

  if (enrichedFights.length === 0) return null;

  return (
    <div className="space-y-5">
      {todayFights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-primary font-display">
              Today
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {todayFights.map((f) => (
              <CompactFightCard key={f.id} fight={f} onPredict={handlePredict} />
            ))}
          </div>
        </div>
      )}

      <Collapsible open={tabOpen} onOpenChange={setTabOpen}>
        <Tabs value={activeSport} onValueChange={(v) => { setActiveSport(v); setTabOpen(true); }} className="w-full">
          <div className="flex items-center gap-2">
            <TabsList className="flex-1 flex overflow-x-auto bg-muted/50 p-1 gap-0.5 h-auto flex-wrap">
              {SPORT_TABS.map((sport) => {
                const count = sportCounts[sport] || 0;
                if (sport !== "ALL" && count === 0) return null;
                return (
                  <TabsTrigger
                    key={sport}
                    value={sport}
                    className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground"
                  >
                    {SPORT_IMG[sport] && (
                      <img src={SPORT_IMG[sport]} alt="" className="w-4 h-4 object-contain" />
                    )}
                    <span>{sport}</span>
                    <span className="text-[9px] text-muted-foreground">({count})</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <CollapsibleTrigger asChild>
              <button className="p-1.5 rounded-md hover:bg-muted/60 transition-colors">
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${tabOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <div className="mt-4 space-y-5">
              {dayGroups.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No upcoming predictions for this sport.
                </p>
              )}
              {dayGroups.map(([dayKey, dayFights]) => (
                <div key={dayKey}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {dayKey === "Unknown" ? "Date TBD" : formatDayLabel(dayKey)}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {dayFights.map((f) => (
                      <CompactFightCard key={f.id} fight={f} onPredict={handlePredict} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Tabs>
      </Collapsible>

      {showViewAll && (
        <div className="text-center pt-2">
          <Button asChild variant="outline" size="sm" className="border-primary/30">
            <Link to="/predictions">View All Predictions →</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
