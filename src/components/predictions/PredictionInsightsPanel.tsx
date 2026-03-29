import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Activity, Brain,
  BarChart3, Eye, EyeOff, Droplets, AlertTriangle, Bug, Sparkles,
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
  type LiquidityLabel,
  type ConfidenceLabel,
} from "@/lib/prediction-insights";

/* ── Constants ── */
const AI_CACHE_TTL = 5 * 60 * 1000;
const AI_REQUEST_TIMEOUT = 6_000; // 6s hard timeout
const isDev = import.meta.env.DEV;

/* ── Visual helpers ── */
function TrendBadge({ trend }: { trend: TrendLabel }) {
  const config = {
    Rising:  { icon: <TrendingUp className="w-3 h-3" />,  cls: "text-green-400" },
    Falling: { icon: <TrendingDown className="w-3 h-3" />, cls: "text-red-400" },
    Stable:  { icon: <Minus className="w-3 h-3" />,        cls: "text-muted-foreground" },
  }[trend];
  return (
    <div className="flex items-center justify-center gap-1">
      {config.icon}
      <span className={`text-sm font-bold ${config.cls}`}>{trend}</span>
    </div>
  );
}

function LiquidityBadge({ liq }: { liq: LiquidityLabel }) {
  const cls = liq === "High" ? "text-green-400" : liq === "Medium" ? "text-blue-400" : "text-yellow-400";
  return (
    <div className="flex items-center justify-center gap-1">
      <Droplets className="w-3 h-3 opacity-60" />
      <span className={`text-sm font-bold ${cls}`}>{liq}</span>
    </div>
  );
}

/* ── "Why this matters" one-liner ── */
function getWhyLine(confidence: ConfidenceLabel, liq: LiquidityLabel, trend: TrendLabel): string | null {
  if (confidence === "Strong Favorite" && liq === "High")
    return "Deep liquidity backs a clear market lean — pricing is more reliable here.";
  if (liq === "Low")
    return "Lower liquidity means price can move quickly on new entries.";
  if (confidence === "Close Market")
    return "No strong favorite — small entries can shift the balance.";
  if (trend === "Rising")
    return "Momentum is building, backed by recent activity.";
  return null;
}

/* ── AI insight types & cache ── */
interface AIInsight {
  summary: string;
  confidenceLabel?: string;
  signalTags?: string[];
  caution?: string;
  fallback: boolean;
}

const aiCache = new Map<string, { ts: number; data: AIInsight }>();
/** Track in-flight requests to prevent duplicate fetches */
const inflightRequests = new Map<string, Promise<AIInsight | null>>();

async function fetchAIInsight(
  fight: Fight,
  localData: ReturnType<typeof buildLocalData>,
): Promise<AIInsight | null> {
  const cacheKey = fight.id;

  // Return cached result if fresh
  const cached = aiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AI_CACHE_TTL) {
    if (isDev) console.log(`[InsightsPanel] cache hit for ${cacheKey}`);
    return cached.data;
  }

  // Deduplicate in-flight requests
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    if (isDev) console.log(`[InsightsPanel] deduped request for ${cacheKey}`);
    return inflight;
  }

  const promise = (async (): Promise<AIInsight | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT);

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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        if (isDev) console.warn(`[InsightsPanel] AI response ${resp.status}`);
        return null;
      }

      const data = await resp.json();
      if (data.fallback) {
        if (isDev) console.log(`[InsightsPanel] AI returned fallback: ${data.error}`);
        return null;
      }

      const result: AIInsight = {
        summary: data.summary,
        confidenceLabel: data.confidenceLabel,
        signalTags: data.signalTags,
        caution: data.caution,
        fallback: false,
      };
      aiCache.set(cacheKey, { ts: Date.now(), data: result });
      if (isDev) console.log(`[InsightsPanel] AI insight cached for ${cacheKey}`);
      return result;
    } catch (err) {
      if (isDev) {
        const msg = err instanceof Error ? err.message : "unknown";
        console.warn(`[InsightsPanel] AI fetch failed (${msg}) — using local fallback`);
      }
      return null;
    }
  })();

  inflightRequests.set(cacheKey, promise);
  promise.finally(() => inflightRequests.delete(cacheKey));
  return promise;
}

/* ── Build local data ── */
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
  const panelRef = useRef<HTMLDivElement>(null);

  const local = useMemo(() => buildLocalData(fight), [fight]);
  const whyLine = useMemo(() => getWhyLine(local.confidence, local.liquidity, local.trend), [local]);

  // Visibility-gated AI fetch — only fire when panel enters viewport
  const triggerFetch = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setAiLoading(true);
    fetchAIInsight(fight, local)
      .then((result) => setAiInsight(result))
      .finally(() => setAiLoading(false));
  }, [fight, local]);

  useEffect(() => {
    if (fetchedRef.current) return;
    if (!panelRef.current) {
      // Fallback: if IntersectionObserver unavailable, fetch immediately
      triggerFetch();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          triggerFetch();
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [triggerFetch]);

  const displayInsight = aiInsight?.summary || local.localInsight;
  const displayCaution = aiInsight?.caution || local.caution;
  const isAI = !!aiInsight && !aiInsight.fallback;

  if (["settled", "cancelled", "refunds_complete"].includes(fight.status)) return null;

  return (
    <div
      ref={panelRef}
      className="mt-3 rounded-xl border border-primary/10 bg-gradient-to-b from-card/90 to-card/60 backdrop-blur-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 shadow-sm"
    >
      {/* Section 1 — Key Numbers */}
      <div className="px-3 sm:px-4 py-3 border-b border-border/15">
        <div className="flex items-center gap-1.5 mb-2.5">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Market Overview</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center">
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wide font-medium">Favored</p>
            <p className="text-sm sm:text-base font-black text-foreground tabular-nums">{local.favProb}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wide font-medium">Volume</p>
            <p className="text-sm sm:text-base font-black text-foreground tabular-nums">{local.volumeFmt}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wide font-medium">Trend</p>
            <TrendBadge trend={local.trend} />
          </div>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wide font-medium">Liquidity</p>
            <LiquidityBadge liq={local.liquidity} />
          </div>
        </div>
      </div>

      {/* Section 2 — Market Signals */}
      {local.signals.length > 0 && (
        <div className="px-3 sm:px-4 py-2.5 border-b border-border/15">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-primary/60" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary/60">Signals</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {local.signals.map((s) => (
              <span
                key={s.label}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/5 ${s.color} backdrop-blur-sm`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Section 3 — AI / Market Read */}
      <div className="px-3 sm:px-4 py-3 border-b border-border/15">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {isAI ? <Sparkles className="w-3.5 h-3.5 text-primary" /> : <Brain className="w-3.5 h-3.5 text-accent" />}
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
              {isAI ? "AI Market Read" : "Market Read"}
            </span>
            {isAI && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">AI</span>
            )}
          </div>
          <button
            onClick={() => setShowAI((v) => !v)}
            className="flex items-center gap-1 text-[9px] text-muted-foreground/60 hover:text-foreground transition-colors rounded-md px-1.5 py-0.5 hover:bg-muted/30"
          >
            {showAI ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showAI ? "Hide" : "Show"}
          </button>
        </div>
        {showAI && (
          <div className="animate-in fade-in duration-200">
            {aiLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded-sm" />
                <Skeleton className="h-3 w-[85%] rounded-sm" />
                <Skeleton className="h-3 w-[65%] rounded-sm" />
              </div>
            ) : (
              <p className="text-[11px] leading-[1.6] text-muted-foreground/90">
                {displayInsight}
              </p>
            )}
            {whyLine && !aiLoading && (
              <p className="mt-2 text-[10px] leading-relaxed text-primary/80 font-medium">
                💡 {whyLine}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Section 4 — Caution */}
      <div className="px-3 sm:px-4 py-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3 h-3 text-yellow-500/60 mt-[2px] shrink-0" />
          <p className="text-[10px] leading-relaxed text-muted-foreground/60">
            {displayCaution}
          </p>
        </div>
      </div>

      {/* Dev debug — never visible in production */}
      {isDev && (
        <Collapsible>
          <CollapsibleTrigger className="w-full px-3 sm:px-4 py-1.5 border-t border-border/10 flex items-center gap-1 text-[9px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
            <Bug className="w-3 h-3" /> Debug
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 sm:px-4 py-2 text-[9px] text-muted-foreground/40 font-mono space-y-0.5 border-t border-border/10 bg-black/20">
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
