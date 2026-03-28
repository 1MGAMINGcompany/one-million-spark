import { useState, useMemo, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, Minus, Activity, Brain,
  BarChart3, Eye, EyeOff, Droplets, AlertTriangle, Bug,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { Fight } from "./FightCard";
import {
  fightToMarketData,
  getTotalVolume,
  getTrendLabel,
  getLiquidityLabel,
  getConfidenceLabel,
  getMarketSignals,
  getCautionMessage,
  generateLocalInsight,
  fmtVolume,
  fmtProbability,
  type TrendLabel,
} from "@/lib/prediction-insights";

/* ── Trend visual helpers ── */
function trendIcon(t: TrendLabel) {
  if (t === "Rising") return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (t === "Falling") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function trendColor(t: TrendLabel) {
  if (t === "Rising") return "text-green-400";
  if (t === "Falling") return "text-red-400";
  return "text-muted-foreground";
}

/* ── AI insight cache ── */
const aiCache = new Map<string, { ts: number; data: AIInsight }>();
const AI_CACHE_TTL = 5 * 60 * 1000; // 5 min

interface AIInsight {
  summary: string;
  confidenceLabel?: string;
  signalTags?: string[];
  caution?: string;
  fallback: boolean;
}

async function fetchAIInsight(fight: Fight, localData: ReturnType<typeof buildLocalData>): Promise<AIInsight | null> {
  const cacheKey = fight.id;
  const cached = aiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AI_CACHE_TTL) return cached.data;

  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prediction-ai-insight`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        title: fight.title,
        sport: fight.source,
        sideA: fight.fighter_a_name,
        sideB: fight.fighter_b_name,
        probabilityA: fight.price_a ?? 0,
        probabilityB: fight.price_b ?? 0,
        volume: localData.volume,
        liquidity: localData.liquidity,
        trend: localData.trend,
        signals: localData.signals.map((s) => s.label),
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.fallback) return null; // use local fallback
    const result: AIInsight = {
      summary: data.summary,
      confidenceLabel: data.confidenceLabel,
      signalTags: data.signalTags,
      caution: data.caution,
      fallback: false,
    };
    aiCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

/* ── Build all local data ── */
function buildLocalData(fight: Fight) {
  const md = fightToMarketData(fight);
  return {
    volume: getTotalVolume(md),
    trend: getTrendLabel(md),
    liquidity: getLiquidityLabel(md),
    confidence: getConfidenceLabel(md),
    signals: getMarketSignals(md),
    caution: getCautionMessage(md),
    localInsight: generateLocalInsight(md),
    favProb: fmtProbability(Math.max(md.priceA, md.priceB)),
    volumeFmt: fmtVolume(getTotalVolume(md)),
    md,
  };
}

/* ── Component ── */
export default function PredictionInsightsPanel({ fight }: { fight: Fight }) {
  const [showAI, setShowAI] = useState(true);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fetchedRef = useRef(false);

  const local = useMemo(() => buildLocalData(fight), [fight]);

  // Async AI hydration — fires once per fight
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setAiLoading(true);
    fetchAIInsight(fight, local)
      .then((result) => setAiInsight(result))
      .finally(() => setAiLoading(false));
  }, [fight.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayInsight = aiInsight?.summary || local.localInsight;
  const displayCaution = aiInsight?.caution || local.caution;
  const isAI = !!aiInsight && !aiInsight.fallback;
  const isDev = import.meta.env.DEV;

  // Don't show for finished markets
  if (["settled", "cancelled", "refunds_complete"].includes(fight.status)) return null;

  return (
    <div className="mt-3 rounded-lg border border-primary/15 bg-card/80 backdrop-blur-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* Section 1: Smart Insights */}
      <div className="px-3 py-2.5 border-b border-border/20">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Smart Insights</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Probability</p>
            <p className="text-sm font-extrabold text-foreground">{local.favProb}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Volume</p>
            <p className="text-sm font-extrabold text-foreground">{local.volumeFmt}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Trend</p>
            <div className="flex items-center justify-center gap-1">
              {trendIcon(local.trend)}
              <span className={`text-sm font-extrabold ${trendColor(local.trend)}`}>{local.trend}</span>
            </div>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Liquidity</p>
            <div className="flex items-center justify-center gap-1">
              <Droplets className="w-3 h-3 text-muted-foreground" />
              <span className={`text-sm font-extrabold ${
                local.liquidity === "High" ? "text-green-400" :
                local.liquidity === "Medium" ? "text-blue-400" : "text-yellow-400"
              }`}>{local.liquidity}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Market Signals */}
      {local.signals.length > 0 && (
        <div className="px-3 py-2 border-b border-border/20">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="w-3.5 h-3.5 text-primary/70" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Market Signals</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {local.signals.map((s) => (
              <span key={s.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: AI Insight */}
      <div className="px-3 py-2.5 border-b border-border/20">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
              {isAI ? "AI Market Read" : "Market Read"}
            </span>
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
          <>
            {aiLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground/90 animate-in fade-in duration-200">
                {displayInsight}
              </p>
            )}
          </>
        )}
      </div>

      {/* Section 4: Caution / Opportunity */}
      <div className="px-3 py-2">
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 text-yellow-400/80 mt-0.5 shrink-0" />
          <p className="text-[10px] leading-relaxed text-muted-foreground/70 italic">
            {displayCaution}
          </p>
        </div>
      </div>

      {/* Dev-only debug */}
      {isDev && (
        <Collapsible>
          <CollapsibleTrigger className="w-full px-3 py-1 border-t border-border/10 flex items-center gap-1 text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <Bug className="w-3 h-3" /> Debug
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 py-2 text-[9px] text-muted-foreground/50 font-mono space-y-0.5 border-t border-border/10">
            <p>priceA: {fight.price_a ?? "null"} | priceB: {fight.price_b ?? "null"}</p>
            <p>volume: ${local.volume.toFixed(0)} | liq: {local.liquidity}</p>
            <p>trend: {local.trend} | conf: {local.confidence}</p>
            <p>signals: {local.signals.map(s => s.label).join(", ") || "none"}</p>
            <p>source: {isAI ? "AI (Lovable)" : "Local fallback"} | loading: {String(aiLoading)}</p>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
