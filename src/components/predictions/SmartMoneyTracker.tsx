import { useMemo } from "react";
import { Activity, TrendingUp, Zap, Eye } from "lucide-react";
import type { Fight } from "./FightCard";
import { fightToMarketData, getTotalVolume } from "@/lib/prediction-insights";
import {
  buildSmartMoneySummary,
  type ActivityLabel,
  type MomentumLabel,
  type WhaleSignal,
} from "@/lib/smart-money";

/* ── Badge helpers ── */
function ActivityBadge({ label }: { label: ActivityLabel }) {
  const cls =
    label === "Unusual Activity"
      ? "text-primary bg-primary/10"
      : label === "Strong Activity"
        ? "text-green-400 bg-green-500/10"
        : label === "Light Activity"
          ? "text-yellow-400 bg-yellow-500/10"
          : "text-muted-foreground bg-muted/20";
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/5 ${cls}`}>{label}</span>;
}

function MomentumBadge({ label }: { label: MomentumLabel }) {
  const cls =
    label === "Momentum Building"
      ? "text-green-400 bg-green-500/10"
      : label === "Volatile Movement"
        ? "text-orange-400 bg-orange-500/10"
        : label === "Thin Market"
          ? "text-yellow-400 bg-yellow-500/10"
          : "text-muted-foreground bg-muted/20";
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/5 ${cls}`}>{label}</span>;
}

function WhaleBadge({ label }: { label: WhaleSignal }) {
  if (label === "No Unusual Entries") return null;
  return (
    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/5 text-primary bg-primary/10">
      {label}
    </span>
  );
}

/* ── Component ── */
export default function SmartMoneyTracker({ fight }: { fight: Fight }) {
  const data = useMemo(() => {
    const md = fightToMarketData(fight);
    const totalVolume = getTotalVolume(md);
    return buildSmartMoneySummary({
      priceA: md.priceA,
      priceB: md.priceB,
      poolAUsd: md.poolAUsd,
      poolBUsd: md.poolBUsd,
      totalVolume,
    });
  }, [fight]);

  if (["settled", "cancelled", "refunds_complete"].includes(fight.status)) return null;

  return (
    <div className="mt-2 rounded-xl border border-primary/10 bg-gradient-to-b from-card/90 to-card/60 backdrop-blur-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 shadow-sm">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-border/15">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
            Big Player Activity
          </span>
        </div>
      </div>

      {/* Signals row */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-border/15">
        <div className="flex items-center gap-1.5 mb-2">
          <Activity className="w-3.5 h-3.5 text-primary/60" />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary/60">Signals</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ActivityBadge label={data.activity} />
          <MomentumBadge label={data.momentum} />
          <WhaleBadge label={data.whaleSignal} />
        </div>
      </div>

      {/* Momentum read */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-border/15">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-accent" />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">Momentum Read</span>
        </div>
        <p className="text-[11px] leading-[1.6] text-muted-foreground/90">{data.quickRead}</p>
      </div>

      {/* Quick insight */}
      {data.hasSignal && (
        <div className="px-3 sm:px-4 py-2.5">
          <div className="flex items-start gap-2">
            <Eye className="w-3 h-3 text-primary/60 mt-[2px] shrink-0" />
            <p className="text-[10px] leading-relaxed text-muted-foreground/60">
              Smart money signals are derived from market activity and are informational only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
