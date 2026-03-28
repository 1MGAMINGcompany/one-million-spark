import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Activity, Brain, BarChart3, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Fight } from "./FightCard";

/* ── Trend detection ── */
type Trend = "up" | "down" | "neutral";

function detectTrend(fight: Fight): Trend {
  const pA = fight.price_a ?? 0;
  const pB = fight.price_b ?? 0;
  // If either side > 0.65 treat as trending toward that side
  if (pA > 0.65 || pB > 0.65) return "up";
  if (pA < 0.35 && pB < 0.35) return "down";
  return "neutral";
}

function trendIcon(t: Trend) {
  if (t === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (t === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function trendLabel(t: Trend) {
  if (t === "up") return "Rising";
  if (t === "down") return "Falling";
  return "Stable";
}

/* ── Market signals ── */
interface Signal { label: string; color: string }

function deriveSignals(fight: Fight, volume: number, trend: Trend): Signal[] {
  const signals: Signal[] = [];
  if (volume > 50_000) signals.push({ label: "High Activity", color: "text-green-400 bg-green-500/10" });
  else if (volume > 10_000) signals.push({ label: "Moderate Activity", color: "text-blue-400 bg-blue-500/10" });
  else if (volume > 0) signals.push({ label: "Low Liquidity", color: "text-yellow-400 bg-yellow-500/10" });

  if (trend === "up") signals.push({ label: "Trending Up", color: "text-green-400 bg-green-500/10" });
  if (trend === "down") signals.push({ label: "Trending Down", color: "text-red-400 bg-red-500/10" });

  const pA = fight.price_a ?? 0;
  const pB = fight.price_b ?? 0;
  if (Math.abs(pA - pB) > 0.4) signals.push({ label: "Sharp Movement", color: "text-orange-400 bg-orange-500/10" });

  return signals;
}

/* ── AI insight placeholder (Falcon-ready) ── */
function generateInsight(fight: Fight, volume: number, trend: Trend): string {
  const favored = (fight.price_a ?? 0) >= (fight.price_b ?? 0) ? fight.fighter_a_name : fight.fighter_b_name;
  const prob = Math.max(fight.price_a ?? 0, fight.price_b ?? 0);
  const pct = prob > 0 ? Math.round(prob * 100) : 50;

  const trendText =
    trend === "up" ? "Recent activity shows upward price movement, suggesting growing market confidence." :
    trend === "down" ? "Market sentiment appears to be shifting — watch for further changes." :
    "The market is currently stable with no strong directional bias.";

  const volText =
    volume > 50_000 ? "High trading volume indicates strong market interest." :
    volume > 5_000 ? "Moderate volume — enough liquidity for reliable signals." :
    "Low volume — odds may shift quickly with new predictions.";

  return `${favored} is currently favored at ${pct}%. ${trendText} ${volText}`;
}

/** Placeholder for future Falcon API */
async function fetchAIInsight(fight: Fight, volume: number, trend: Trend): Promise<string> {
  // TODO: Replace with Falcon API call
  return generateInsight(fight, volume, trend);
}

/* ── Format helpers ── */
function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  if (v > 0) return `$${v.toFixed(0)}`;
  return "—";
}

/* ── Component ── */
export default function PredictionInsightsPanel({ fight }: { fight: Fight }) {
  const [showAI, setShowAI] = useState(true);

  const volume = useMemo(() => {
    if ((fight.polymarket_volume_usd ?? 0) > 0) return fight.polymarket_volume_usd!;
    return (fight.pool_a_usd ?? 0) + (fight.pool_b_usd ?? 0);
  }, [fight]);

  const trend = useMemo(() => detectTrend(fight), [fight]);
  const signals = useMemo(() => deriveSignals(fight, volume, trend), [fight, volume, trend]);

  const favProb = useMemo(() => {
    const p = Math.max(fight.price_a ?? 0, fight.price_b ?? 0);
    return p > 0 ? `${Math.round(p * 100)}%` : "—";
  }, [fight]);

  const aiText = useMemo(() => generateInsight(fight, volume, trend), [fight, volume, trend]);

  // Don't show for finished / settled markets
  if (["settled", "cancelled", "refunds_complete"].includes(fight.status)) return null;

  return (
    <div className="mt-3 rounded-lg border border-primary/15 bg-card/80 backdrop-blur-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Section 1: Smart Insights */}
      <div className="px-3 py-2.5 border-b border-border/20">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Smart Insights</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Probability</p>
            <p className="text-sm font-extrabold text-foreground">{favProb}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Volume</p>
            <p className="text-sm font-extrabold text-foreground">{fmtVol(volume)}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Trend</p>
            <div className="flex items-center justify-center gap-1">
              {trendIcon(trend)}
              <span className={`text-sm font-extrabold ${
                trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-muted-foreground"
              }`}>{trendLabel(trend)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Market Signals */}
      {signals.length > 0 && (
        <div className="px-3 py-2 border-b border-border/20">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="w-3.5 h-3.5 text-primary/70" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Market Signals</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((s) => (
              <span key={s.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: AI Insight */}
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">AI Insight</span>
          </div>
          <button
            onClick={() => setShowAI((v) => !v)}
            className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAI ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showAI ? "Hide" : "Show"}
          </button>
        </div>
        {showAI && (
          <p className="text-[11px] leading-relaxed text-muted-foreground/90 animate-in fade-in duration-200">
            {aiText}
          </p>
        )}
      </div>
    </div>
  );
}
