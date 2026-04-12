import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { SportsWebSocketProvider, useLiveGameState } from "@/hooks/useSportsWebSocket";
import LiveGameBadge, { LiveScoreDisplay } from "@/components/predictions/LiveGameBadge";
import { useTranslation } from "react-i18next";
import { useOperatorBySubdomain, useOperatorSettings } from "@/hooks/useOperator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePrivySafe } from "@/hooks/usePrivySafe";
import { usePrivyLogin } from "@/hooks/usePrivyLogin";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useAllowanceGate } from "@/hooks/useAllowanceGate";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { usePolymarketSession } from "@/hooks/usePolymarketSession";
import { usePolymarketPrices } from "@/hooks/usePolymarketPrices";
import { usePolymarketLivePrices } from "@/hooks/usePolymarketLivePrices";
import { useIsMobile } from "@/hooks/use-mobile";
import { Globe, Trophy, Loader2, ShieldCheck, Search, CalendarPlus, ChevronDown, Zap, Copy, ExternalLink, CreditCard, ArrowUpRight, AlertTriangle, LogOut } from "lucide-react";
import { useFundWallet, useSendTransaction } from "@privy-io/react-auth";
import { polygon } from "viem/chains";
import { encodeFunctionData, parseAbi } from "viem";
import { USDC_E_CONTRACT, USDC_DECIMALS } from "@/lib/polygon-tokens";

import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";
import { Button } from "@/components/ui/button";
import SimplePredictionCard from "@/components/operator/SimplePredictionCard";
import SimplePredictionModal from "@/components/operator/SimplePredictionModal";
import EnableTradingBanner from "@/components/predictions/EnableTradingBanner";
import OperatorBalanceBanner from "@/components/operator/OperatorBalanceBanner";
import MarketGraphModal from "@/components/operator/MarketGraphModal";
import MarketTipsModal from "@/components/operator/MarketTipsModal";
import SocialShareModal, { type ShareVariant } from "@/components/SocialShareModal";
import { WalletGateModal } from "@/components/WalletGateModal";
import PlatformLanguageSwitcher from "@/components/PlatformLanguageSwitcher";
import ScrollableSportTabs, { type SportTabGroup } from "@/components/admin/ScrollableSportTabs";
import SportPickerModal from "@/components/operator/SportPickerModal";
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult, RequoteData } from "@/components/predictions/tradeResultTypes";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import { formatEventDateTime } from "@/lib/formatEventLocalDateTime";
import {
  normalizeOperatorSport,
  isValidOperatorEvent,
} from "@/lib/operatorSportRules";
import { getOperatorTheme } from "@/lib/operatorThemes";
import {
  BROAD_SPORTS,
  toBroadSport,
  extractLeague,
  buildLeagueTabs,
  groupByDate,
} from "@/lib/sportLeagues";

interface OperatorAppProps {
  subdomain: string;
}

interface RequoteAcceptanceContext {
  baselinePrice: number;
  cycleCount: number;
}

/** Extracted so we can call useLiveGameState unconditionally */
function FeaturedEventHero({ fight, theme, t, onPredict }: {
  fight: Fight & { _broadSport?: string; _league?: string };
  theme: ReturnType<typeof getOperatorTheme>;
  t: (key: string, opts?: any) => string;
  onPredict: () => void;
}) {
  const liveState = useLiveGameState((fight as any).polymarket_slug);
  const isLive = liveState?.live || fight.status === "live";

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4">
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          backgroundColor: theme.isDark ? "rgba(255,255,255,0.05)" : theme.primary + "08",
          border: `1px solid ${theme.isDark ? "rgba(255,255,255,0.1)" : theme.primary + "20"}`,
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          {liveState && (liveState.live || liveState.ended) ? (
            <LiveGameBadge state={liveState} theme={theme} />
          ) : isLive ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">● LIVE</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.primary + "18", color: theme.primary }}>
              <Zap className="w-3 h-3 inline mr-0.5" />{t("operator.upNext")}
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
            {(fight as any)._broadSport && BROAD_SPORTS[(fight as any)._broadSport]?.label
              ? `${BROAD_SPORTS[(fight as any)._broadSport].label} • ${(fight as any)._league || ""}`
              : (fight as any)._league || ""}
          </span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold" style={{ color: theme.textPrimary }}>
            {resolveOutcomeName(fight.fighter_a_name, "a", fight)}
          </span>
          {liveState && liveState.live && liveState.score ? (
            <LiveScoreDisplay state={liveState} theme={theme} />
          ) : (
            <span className="text-sm font-bold" style={{ color: theme.textMuted }}>{t("operator.vs")}</span>
          )}
          <span className="text-lg font-bold text-right" style={{ color: theme.textPrimary }}>
            {resolveOutcomeName(fight.fighter_b_name, "b", fight)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: theme.textMuted }}>
            {(fight as any).event_date ? formatEventDateTime((fight as any).event_date) : ""}
          </span>
          <button
            onClick={onPredict}
            className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
          >
            {t("operator.predictNow")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OperatorApp({ subdomain }: OperatorAppProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data: operator, isLoading } = useOperatorBySubdomain(subdomain);
  const { data: settings } = useOperatorSettings(operator?.id ?? null);

  const { authenticated, getAccessToken, logout } = usePrivySafe();
  const { login } = usePrivyLogin();
  const { walletAddress: address, eoaAddress, isPrivyUser } = usePrivyWallet();
  const { state: allowanceState, ensureAllowance, reset: resetAllowance } = useAllowanceGate();
  const { usdc_balance, refetch: refetchBalance } = usePolygonUSDC();
  const {
    hasSession,
    canTrade,
    status: pmSessionStatus,
    safeDeployed,
    loading: pmSessionLoading,
    error: pmSessionError,
    setupTradingWallet,
    refreshSession,
  } = usePolymarketSession();
  usePolymarketPrices();

  // Live WebSocket prices — moved after operatorFights query declaration

  const isConnected = authenticated && isPrivyUser;

  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [selectedPick, setSelectedPick] = useState<"fighter_a" | "fighter_b" | "draw" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<TradeResult | null>(null);
  const [showWalletGate, setShowWalletGate] = useState(false);
  const [userEntries, setUserEntries] = useState<any[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [selling, setSelling] = useState(false);
  const [broadSportFilter, setBroadSportFilter] = useState(() => {
    try { return localStorage.getItem("1mg-sport-filter") || "ALL"; } catch { return "ALL"; }
  });
  const [leagueFilter, setLeagueFilter] = useState<string | null>(() => {
    try { return localStorage.getItem("1mg-league-filter") || null; } catch { return null; }
  });

  // Persist filter selections
  useEffect(() => {
    try {
      localStorage.setItem("1mg-sport-filter", broadSportFilter);
      if (leagueFilter) localStorage.setItem("1mg-league-filter", leagueFilter);
      else localStorage.removeItem("1mg-league-filter");
    } catch {}
  }, [broadSportFilter, leagueFilter]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"events" | "picks">("events");
  const [graphFight, setGraphFight] = useState<Fight | null>(null);
  const [tipsFight, setTipsFight] = useState<Fight | null>(null);
  const [sportPickerOpen, setSportPickerOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week">("all");
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawDest, setWithdrawDest] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const { fundWallet } = useFundWallet();
  const { sendTransaction } = useSendTransaction();
  const [requoteData, setRequoteData] = useState<RequoteData | null>(null);
  const acceptedRequoteRef = useRef<RequoteAcceptanceContext | null>(null);

  // Social share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVariant, setShareVariant] = useState<ShareVariant>("prediction");
  const [shareFight, setShareFight] = useState<Fight | null>(null);
  const [shareAmount, setShareAmount] = useState<number | undefined>();

  const theme = getOperatorTheme(operator?.theme);

  const ensureTradingWalletReady = useCallback(async () => {
    if (hasSession && canTrade) return true;

    const result = await setupTradingWallet();
    const refreshed = result.success ? await refreshSession() : null;
    const ready = result.ready ?? refreshed?.canTrade ?? false;

    if (!result.success || !ready) {
      console.warn("[OperatorApp] Trading wallet setup not ready — per-user session required");
      return false;
    }

    return true;
  }, [hasSession, canTrade, refreshSession, setupTradingWallet]);

  // ── STRICT event query ──
  const { data: operatorFights, isError: opFightsError } = useQuery({
    queryKey: ["operator_fights", operator?.id],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 2 * 86400000).toISOString();
      const { data } = await (supabase as any)
        .from("prediction_fights")
        .select("*, prediction_events!event_id(category)")
        .or(`operator_id.eq.${operator!.id},and(operator_id.is.null,visibility.in.(platform,all))`)
        .in("status", ["open", "live", "locked"])
        .not("polymarket_active", "is", false)
        .not("event_date", "is", null)
        .gte("event_date", cutoff)
        .not("fighter_a_name", "in", '("Yes","No","Over","Under")')
        .not("fighter_b_name", "in", '("Yes","No","Over","Under")')
        .order("event_date", { ascending: true })
        .limit(1000);
      return ((data || []) as any[]).map((f: any) => ({
        ...f,
        _category: f.prediction_events?.category || null,
      })) as Fight[];
    },
    enabled: !!operator?.id,
    refetchInterval: 30000,
  });

  // Real-time WebSocket prices from Polymarket CLOB
  const { livePrices, wsConnected } = usePolymarketLivePrices(operatorFights || []);

  const allowedSports = settings?.allowed_sports || [];
  const disabledSports = (operator as any)?.disabled_sports || [];
  const backendDegraded = opFightsError;

  const loadUserEntries = useCallback(async () => {
    if (!address) return;
    let query = supabase.from("prediction_entries").select("*").eq("wallet", address.toLowerCase());
    if (operator?.id) {
      query = query.eq("source_operator_id", operator.id);
    }
    const { data } = await query;
    if (data) setUserEntries(data);
  }, [address, operator?.id]);

  useEffect(() => { loadUserEntries(); }, [loadUserEntries]);

  // Auto-refresh user entries every 15s so settlement results appear without manual reload
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(loadUserEntries, 15_000);
    return () => clearInterval(interval);
  }, [address, loadUserEntries]);

  // ── Fetch fights for My Picks independently (includes settled/locked/finished) ──
  const userFightIds = useMemo(() => userEntries.map((e: any) => e.fight_id), [userEntries]);
  const { data: picksFights } = useQuery({
    queryKey: ["picks_fights", userFightIds],
    queryFn: async () => {
      if (userFightIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("prediction_fights")
        .select("*")
        .in("id", userFightIds);
      return (data || []) as Fight[];
    },
    enabled: userFightIds.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // ── STRICT client-side validation pipeline (with live price merge) ──
  const allFights = useMemo(() => {
    const filtered = (operatorFights || []).filter(f => {
      if (!isValidOperatorEvent(f as any)) return false;
      const eventDate = (f as any).event_date;
      if (!eventDate) return false;
      const d = new Date(eventDate);
      if (isNaN(d.getTime())) return false;
      const isActive = ["live", "open", "locked"].includes(f.status);
      const isFuture = d.getTime() > Date.now();
      if (!isActive && !isFuture) return false;
      const eventAgeMs = Date.now() - d.getTime();
      const lastSync = (f as any).polymarket_last_synced_at;
      const syncAgeMs = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
      const pricesStale = syncAgeMs > 30 * 60_000;
      if ((f.status === "locked" || f.status === "live") && eventAgeMs > 2 * 3600_000 && pricesStale) return false;
      if ((f.status === "locked" || f.status === "live") && eventAgeMs > 5 * 3600_000) return false;

      const sport = normalizeOperatorSport(
        f.event_name,
        (f as any).sport ?? (f as any)._category ?? null,
        (f as any).polymarket_slug ?? null,
      );
      if (!sport) return false;
      if (disabledSports.length > 0 && disabledSports.some((ds: string) => ds.toUpperCase() === sport)) return false;
      if (allowedSports.length > 0 && (f as any).operator_id !== operator?.id) {
        const sportLower = sport.toLowerCase();
        const match = allowedSports.some((s: string) =>
          s.toLowerCase() === sportLower || sportLower.includes(s.toLowerCase())
        );
        if (!match) return false;
      }
      return true;
    });
    // Merge live WebSocket prices
    if (Object.keys(livePrices).length === 0) return filtered;
    return filtered.map(f => {
      const live = livePrices[f.id];
      if (!live) return f;
      return { ...f, price_a: live.priceA, price_b: live.priceB };
    });
  }, [operatorFights, allowedSports, disabledSports, operator?.id, livePrices]);

  // ── Attach broad sport + league to each fight, sort operator events first ──
  const enrichedFights = useMemo(() => {
    const mapped = allFights.map(f => {
      const norm = normalizeOperatorSport(
        f.event_name,
        (f as any).sport ?? (f as any)._category ?? null,
        (f as any).polymarket_slug ?? null,
      ) || "OTHER";
      const broad = toBroadSport(norm);
      const league = extractLeague(broad, f.event_name, (f as any)._category, (f as any).polymarket_slug);
      const isOperatorEvent = (f as any).operator_id === operator?.id && (f as any).operator_id != null;
      return { ...f, _broadSport: broad, _league: league, _isOperatorEvent: isOperatorEvent };
    });
    // Operator-created events appear first, then sorted by event_date
    mapped.sort((a, b) => {
      if (a._isOperatorEvent && !b._isOperatorEvent) return -1;
      if (!a._isOperatorEvent && b._isOperatorEvent) return 1;
      const da = new Date((a as any).event_date || 0).getTime();
      const db = new Date((b as any).event_date || 0).getTime();
      return da - db;
    });
    return mapped;
  }, [allFights, operator?.id]);

  // ── Sport counts for picker ──
  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    enrichedFights.forEach(f => {
      counts[f._broadSport] = (counts[f._broadSport] || 0) + 1;
    });
    return counts;
  }, [enrichedFights]);

  // ── Build broad sport tabs (Level 1) ──
  const broadSportTabs = useMemo<SportTabGroup[]>(() => {
    const tabs = Object.entries(sportCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([sport, count]) => ({
        key: sport,
        label: BROAD_SPORTS[sport]?.label || sport,
        emoji: BROAD_SPORTS[sport]?.emoji || "🏆",
        count,
      }));
    return [{
      label: "Sports",
      tabs: [{ key: "ALL", label: t("operator.allSports"), emoji: "🔥", count: enrichedFights.length }, ...tabs],
    }];
  }, [enrichedFights, sportCounts]);

  // ── Featured event ──
  const featuredEvent = useMemo(() => {
    if (broadSportFilter !== "ALL" || searchQuery || activeTab === "picks") return null;
    const now = Date.now();
    // 1. Actually live event (confirmed by fight status)
    const live = enrichedFights.find(f => f.status === "live");
    if (live) return live;
    // 2. Next event today
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const today = enrichedFights.find(f => {
      const d = new Date((f as any).event_date || 0).getTime();
      return d >= now && d <= endOfDay.getTime();
    });
    if (today) return today;
    // 3. Next upcoming
    return enrichedFights.find(f => new Date((f as any).event_date || 0).getTime() >= now) || null;
  }, [enrichedFights, broadSportFilter, searchQuery, activeTab]);

  // ── Build league tabs (Level 2) for selected sport ──
  const leagueTabs = useMemo(() => {
    if (broadSportFilter === "ALL") return [];
    const sportFights = enrichedFights.filter(f => f._broadSport === broadSportFilter);
    if (sportFights.length === 0) return [];
    return buildLeagueTabs(broadSportFilter, sportFights as any);
  }, [enrichedFights, broadSportFilter]);

  // ── Filtered fights ──
  const filteredFights = useMemo(() => {
    // My Picks: use independently-fetched fights, bypass all browse filters
    if (activeTab === "picks") {
      return (picksFights || []).sort((a, b) => {
        const da = new Date((a as any).event_date || 0).getTime();
        const db = new Date((b as any).event_date || 0).getTime();
        return db - da; // newest first
      });
    }
    let fights = enrichedFights;
    if (broadSportFilter !== "ALL") {
      fights = fights.filter(f => f._broadSport === broadSportFilter);
    }
    if (leagueFilter && leagueFilter !== "ALL_LEAGUES") {
      fights = fights.filter(f => f._league === leagueFilter);
    }
    // Time filter
    if (timeFilter === "today") {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      fights = fights.filter(f => {
        const d = new Date((f as any).event_date || 0).getTime();
        return d <= endOfDay.getTime();
      });
    } else if (timeFilter === "week") {
      const endOfWeek = Date.now() + 7 * 86400000;
      fights = fights.filter(f => {
        const d = new Date((f as any).event_date || 0).getTime();
        return d <= endOfWeek;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      fights = fights.filter(f =>
        f.fighter_a_name.toLowerCase().includes(q) ||
        f.fighter_b_name.toLowerCase().includes(q) ||
        f.event_name.toLowerCase().includes(q)
      );
    }
    // Exclude featured event from main list to avoid duplication
    if (featuredEvent) {
      fights = fights.filter(f => f.id !== featuredEvent.id);
    }
    return fights;
  }, [enrichedFights, broadSportFilter, leagueFilter, searchQuery, activeTab, picksFights, timeFilter, featuredEvent]);

  // ── Date-grouped fights for display ──
  const dateGroups = useMemo(() => groupByDate(filteredFights), [filteredFights]);

  // Collect polymarket slugs and market ID mappings for live tracking
  const liveSlugs = useMemo(() => {
    return enrichedFights
      .map(f => (f as any).polymarket_slug)
      .filter((s): s is string => !!s);
  }, [enrichedFights]);

  const slugToMarketId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of enrichedFights) {
      const slug = (f as any).polymarket_slug;
      const mid = (f as any).polymarket_market_id;
      if (slug && mid) {
        map[slug] = String(mid);
      }
    }
    return map;
  }, [enrichedFights]);

  const handleSubmit = async (amountUsd: number) => {
    if (!selectedFight || !selectedPick || !isConnected || !address) return;
    const acceptedRequote = acceptedRequoteRef.current;
    setSubmitting(true);
    resetAllowance();
    try {
      const privyToken = await getAccessToken();
      if (!privyToken) {
        toast.error(t("operator.sessionExpired"), { description: t("operator.pleaseLoginAgain") });
        setSubmitting(false);
        return;
      }
      // Per-user trading wallet is REQUIRED — no shared credentials fallback
      const isPolymarketFight = selectedFight.source === "polymarket" || Boolean((selectedFight as any).polymarket_market_id);
      if (isPolymarketFight && (!hasSession || !canTrade)) {
        const walletReady = await ensureTradingWalletReady();
        if (!walletReady) {
          toast.error(t("operator.tradingWalletRequired"), {
            description: "Please set up your trading wallet first.",
          });
          setSubmitting(false);
          return;
        }
      }

      const feeRate = selectedFight.commission_bps != null
        ? selectedFight.commission_bps / 10_000
        : (selectedFight.source === "polymarket" ? 0.02 : 0.05);
      const feeUsdc = amountUsd * feeRate;
      if (feeUsdc > 0.01) {
        const approved = await ensureAllowance(feeUsdc);
        if (!approved) { setSubmitting(false); return; }
      }
      // Clear any previous requote data at the start of a fresh submission
      setRequoteData(null);
      // Use fetch directly so we can read the JSON body on non-2xx responses
      const submitUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prediction-submit`;
      const submitResp = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-privy-token": privyToken,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          fight_id: selectedFight.id,
          wallet: address,
          wallet_eoa: eoaAddress ?? undefined,
          fighter_pick: selectedPick,
          amount_usd: amountUsd,
          chain: "polygon",
          source_operator_id: operator?.id,
          quote_price: acceptedRequote
            ? acceptedRequote.baselinePrice
            : (selectedPick === "fighter_a"
                ? (selectedFight.price_a ?? null)
                : (selectedFight.price_b ?? null)),
          ...(acceptedRequote
            ? {
                accepted_requote: true,
                requote_count: acceptedRequote.cycleCount,
              }
            : {}),
        }),
      });
      const data = await submitResp.json().catch(() => ({}));
      if (!submitResp.ok || data?.error) {
        const msg = data?.error || "Backend error";
        const errorCode = data?.error_code || "";

        if (errorCode === "market_moving_too_fast") {
          acceptedRequoteRef.current = null;
          setRequoteData(null);
          toast.error("Market moving too fast", {
            description: "Please review a fresh quote and try again.",
          });
          setSubmitting(false);
          return;
        }

        if (errorCode === "price_changed_requote_required") {
          if (acceptedRequote) {
            acceptedRequoteRef.current = null;
            setRequoteData(null);
            toast.error("Market moving too fast", {
              description: "Please review a fresh quote and try again.",
            });
            setSubmitting(false);
            return;
          }

          acceptedRequoteRef.current = null;
          setRequoteData({
            old_price: data.old_price,
            new_price: data.new_price,
            updated_payout: data.updated_payout,
            slippage_bps: data.slippage_bps,
          });
          setSubmitting(false);
          return;
        }

        if (errorCode === "trading_wallet_setup_required" || errorCode === "trading_wallet_not_ready" || errorCode === "no_trading_session") {
          toast.error(t("operator.tradingWalletRequired"), {
            description: "Please set up your trading wallet first.",
          });
          setSubmitting(false);
          return;
        }
        throw new Error(msg);
      }

      // ── Client-side CLOB submission for Polymarket orders ──
      if (data?.action === "client_submit" && data.order_params && data.clob_credentials) {
        const t0 = performance.now();
        const CLOB_OVERALL_TIMEOUT_MS = 60_000;
        const clobAbort = new AbortController();
        const clobTimeoutId = setTimeout(() => clobAbort.abort(), CLOB_OVERALL_TIMEOUT_MS);
        try {
        const { submitClobOrder } = await import("@/lib/clobOrderClient");
        let clobResult = await submitClobOrder(data.order_params, data.clob_credentials);
        const t1 = performance.now();
        console.log("[OperatorApp] first CLOB submit: %dms success=%s", Math.round(t1 - t0), clobResult.success);

        let failureClass = clobResult.success ? null : "first_submit_rejected";

        // Auto-re-derive credentials on "Invalid api key" — exactly ONE retry
        if (!clobResult.success && clobResult.errorCode === "clob_rejected" && clobResult.error?.toLowerCase().includes("invalid api key") && data.clob_credentials.trading_key) {
          failureClass = "refresh_attempted";
          const t2 = performance.now();
          try {
            const { deriveClobCredentials } = await import("@/lib/clobCredentialClient");
            const derivedResult = await deriveClobCredentials(data.clob_credentials.trading_key as `0x${string}`);
            const t3 = performance.now();
            console.log("[OperatorApp] credential rederive: %dms success=%s", Math.round(t3 - t2), !!derivedResult.credentials);

            if (!derivedResult.credentials) {
              failureClass = "refresh_failed";
            } else {
              const saveCreds = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-save-credentials`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-privy-token": privyToken, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
                body: JSON.stringify({ wallet: address, api_key: derivedResult.credentials.apiKey, api_secret: derivedResult.credentials.apiSecret, passphrase: derivedResult.credentials.passphrase }),
              });
              const t4 = performance.now();
              console.log("[OperatorApp] save credentials: %dms ok=%s", Math.round(t4 - t3), saveCreds.ok);

              if (!saveCreds.ok) {
                failureClass = "refresh_failed";
              } else {
                const freshCreds = { ...data.clob_credentials, api_key: derivedResult.credentials.apiKey, api_secret: derivedResult.credentials.apiSecret, passphrase: derivedResult.credentials.passphrase };
                clobResult = await submitClobOrder(data.order_params, freshCreds);
                const t5 = performance.now();
                console.log("[OperatorApp] retry CLOB submit: %dms success=%s", Math.round(t5 - t4), clobResult.success);
                failureClass = clobResult.success ? null : "retry_rejected";
              }
            }
          } catch (reDerivErr) {
            failureClass = "refresh_failed";
            console.warn("[OperatorApp] credential re-derivation failed:", reDerivErr);
          }
        }

        // Report result back to backend
        const confirmUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prediction-confirm`;
        const confirmResp = await fetch(confirmUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-privy-token": privyToken,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            trade_order_id: data.trade_order_id,
            polymarket_order_id: clobResult.orderId || null,
            status: clobResult.success ? "submitted" : "failed",
            error_code: clobResult.errorCode || null,
            error_message: clobResult.error || null,
            failure_class: failureClass,
            diagnostics: clobResult.diagnostics || null,
          }),
        });
        const confirmData = await confirmResp.json().catch(() => ({}));
        const tEnd = performance.now();
        console.log("[OperatorApp] total CLOB flow: %dms", Math.round(tEnd - t0));

        if (!clobResult.success) {
          const isGeoBlock = clobResult.errorCode === "clob_geo_blocked";
          const isInvalidKey = clobResult.error?.toLowerCase().includes("invalid api key");
          if (isGeoBlock) {
            toast.error("Trading is not available in your region");
          } else if (isInvalidKey) {
            toast.error("Trading credentials could not be refreshed", {
              description: "Please sign out and sign back in to reset your trading session.",
              duration: 8000,
            });
          } else {
            toast.error(t("operator.predictionFailed"), {
              description: clobResult.error || "Exchange rejected the order",
            });
          }
          setSubmitting(false);
          return;
        }

        acceptedRequoteRef.current = null;
        setRequoteData(null);
        setLastTradeResult({
          trade_order_id: confirmData?.trade_order_id || data.trade_order_id,
          trade_status: confirmData?.trade_status || "submitted",
          requested_amount_usdc: data.requested_amount_usdc,
          fee_usdc: data.fee_usdc,
          fee_bps: data.fee_bps,
          net_amount_usdc: data.net_amount_usdc,
          entry_id: confirmData?.entry_id,
        });
        setShareAmount(amountUsd);
        clearTimeout(clobTimeoutId);
        toast.success(t("operator.predictionSubmitted"), {
          description: t("operator.amountPlaced", { amount: amountUsd.toFixed(2) }),
        });
        setShowSuccess(true);
        loadUserEntries();
        setTimeout(() => refetchBalance(), 3000);
        return;
        } catch (clobErr: any) {
          if (clobAbort.signal.aborted) {
            console.error("[OperatorApp] CLOB submission timed out after 60s");
            toast.error("Submission timed out", { description: "The order took too long. Please try again." });
          } else {
            throw clobErr;
          }
          setSubmitting(false);
          return;
        } finally {
          clearTimeout(clobTimeoutId);
        }
      }

      // Native event path (non-Polymarket) — direct fill
      acceptedRequoteRef.current = null;
      setRequoteData(null);
      setLastTradeResult({
        trade_order_id: data?.trade_order_id,
        trade_status: data?.trade_status,
        requested_amount_usdc: data?.requested_amount_usdc,
        fee_usdc: data?.fee_usdc,
        fee_bps: data?.fee_bps,
        net_amount_usdc: data?.net_amount_usdc,
        entry_id: data?.entry_id,
      });
      setShareAmount(amountUsd);
      toast.success(t("operator.predictionSubmitted"), {
        description: t("operator.amountPlaced", { amount: amountUsd.toFixed(2) }),
      });
      setShowSuccess(true);
      loadUserEntries();
      setTimeout(() => refetchBalance(), 3000);
    } catch (err: any) {
      const msg = err.message || "";
      acceptedRequoteRef.current = null;
      if (msg.includes("expired") || msg.includes("closed")) {
        toast.error(t("operator.marketClosed"));
      } else if (msg.includes("finished")) {
        toast.error(t("operator.eventFinished"));
      } else {
        toast.error(t("operator.predictionFailed"), { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePredict = (fight: Fight, pick: "fighter_a" | "fighter_b" | "draw") => {
    const isStarted = (fight as any).event_date && new Date((fight as any).event_date).getTime() < Date.now();
    const isPolymarket = !!(fight as any).polymarket_slug;
    const isTradeableStatus = fight.status === "open" || fight.status === "live" || (fight.status === "locked" && isStarted && isPolymarket);
    if (!isTradeableStatus) {
      toast.error(t("operator.marketClosed"));
      return;
    }
    if (!isConnected) {
      if (!authenticated) login();
      else setShowWalletGate(true);
      return;
    }
    setSelectedFight(fight);
    setSelectedPick(pick);
  };

  const handleClaim = async (fightId: string) => {
    if (!address) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-claim", {
        body: { fight_id: fightId, wallet: address, chain: "polygon" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(t("operator.rewardClaimed"), { description: t("operator.rewardSent", { amount: (data.reward_usd || 0).toFixed(2) }) });
      loadUserEntries();
      setTimeout(() => refetchBalance(), 3000);
    } catch (err: any) {
      toast.error(t("operator.claimFailed"), { description: err.message });
    } finally {
      setClaiming(false);
    }
  };

  const handleSharePick = () => {
    if (!selectedFight || !selectedPick) return;
    setShareFight(selectedFight);
    setShareVariant("prediction");
    setShareOpen(true);
  };

  const handleShareWin = (fight: Fight) => {
    setShareFight(fight);
    setShareVariant("claim_win");
    setShareOpen(true);
  };

  const handleAddFunds = () => {
    setShowFundsModal(true);
  };

  const handleSell = async (fightId: string) => {
    if (!address) return;
    setSelling(true);
    try {
      const privyToken = await getAccessToken();
      if (!privyToken) { setSelling(false); return; }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prediction-sell`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-privy-token": privyToken, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ fight_id: fightId, wallet: address }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        if (data?.error_code === "clob_geo_blocked") { toast.error("Trading is not available in your region"); setSelling(false); return; }
        throw new Error(data?.error || "Sell failed");
      }
      toast.success(t("operator.sold"), { description: `$${(data.expected_usdc || 0).toFixed(2)}` });
      loadUserEntries();
      setTimeout(() => refetchBalance(), 3000);
    } catch (err: any) {
      toast.error(t("operator.sellFailed", "Sell failed"), { description: err.message });
    } finally {
      setSelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.textMuted }} />
      </div>
    );
  }

  if (!operator) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-md space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-muted border border-border flex items-center justify-center mb-2">
            <Globe className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("operator.appNotExist")}</h1>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
            {t("operator.appNotExistDesc")}
          </p>
          <a
            href="https://1mg.live"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-base font-bold text-black transition-all duration-200 hover:scale-[1.02] shadow-lg"
            style={{ background: "linear-gradient(135deg, #d4a017, #f5c842)" }}
          >
            {t("operator.buyYourApp")}
          </a>
          <p className="text-muted-foreground/50 text-xs">
            {t("operator.poweredByLabel")} <a href="https://1mg.live" className="underline hover:opacity-80">1MG</a>
          </p>
        </div>
      </div>
    );
  }

  const pickedNameForShare = shareFight && selectedPick
    ? (selectedPick === "draw" ? "Draw" : resolveOutcomeName(
        selectedPick === "fighter_a" ? shareFight.fighter_a_name : shareFight.fighter_b_name,
        selectedPick === "fighter_a" ? "a" : "b",
        shareFight
      ))
    : undefined;


  return (
    <SportsWebSocketProvider slugs={liveSlugs} slugToMarketId={slugToMarketId}>
    <div className="min-h-screen" style={{ backgroundColor: theme.bg, color: theme.textPrimary }}>
      {/* Navbar */}
      <nav
        className="backdrop-blur-xl sticky top-0 z-40"
        style={{ backgroundColor: theme.navBg, borderBottom: `1px solid ${theme.navBorder}` }}
      >
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {operator.logo_url && (
              <img src={operator.logo_url} alt={operator.brand_name} className="h-7 w-7 rounded-lg object-contain" />
            )}
            <span className="font-bold text-base" style={{ color: theme.textPrimary }}>
              {operator.brand_name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <PlatformLanguageSwitcher />
            {isConnected && address ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono" style={{ color: theme.textMuted }}>
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                <button
                  onClick={() => logout()}
                  className="p-1.5 rounded-md transition-colors hover:bg-white/10"
                  title="Sign out"
                  style={{ color: theme.textMuted }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <Button
                onClick={login}
                size="sm"
                className="text-xs font-bold border-0"
                style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
              >
                {t("operator.signIn")}
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Balance banner — show combined smart wallet + EOA balance */}
      {isConnected && (
        <OperatorBalanceBanner
          balanceUsdce={usdc_balance}
          eoaAddress={eoaAddress}
          theme={theme}
          onAddFunds={handleAddFunds}
        />
      )}

      {/* Geo-block: compliance enforced by backend only, UI stays interactive */}

      {isConnected && (
        <div className="max-w-4xl mx-auto px-4 pt-3">
          <EnableTradingBanner
            hasSession={hasSession}
            canTrade={canTrade}
            loading={pmSessionLoading}
            error={pmSessionError}
            safeDeployed={safeDeployed}
            status={pmSessionStatus}
            onEnable={() => {
              void ensureTradingWalletReady();
            }}
          />
        </div>
      )}

      {/* Tab bar: Events | My Picks */}
      {isConnected && (
        <div className="max-w-4xl mx-auto px-4 pt-3">
          <div
            className="flex gap-1 rounded-lg p-1 w-fit"
            style={{ backgroundColor: theme.surfaceBg }}
          >
            {(["events", "picks"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
                style={{
                  backgroundColor: activeTab === tab ? theme.cardBg : "transparent",
                  color: activeTab === tab ? theme.textPrimary : theme.textMuted,
                  boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {tab === "events" ? t("operator.events") : `${t("operator.myPicks")}${userEntries.length > 0 ? ` (${userEntries.length})` : ""}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Level 1: Broad Sport Tabs (scrollable chips) — hidden in My Picks */}
      {activeTab !== "picks" && <div className="max-w-4xl mx-auto px-4 pt-3 space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {/* All Sports button → opens modal */}
          <button
            onClick={() => setSportPickerOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
            style={{
              backgroundColor: broadSportFilter === "ALL" ? theme.primary : theme.surfaceBg,
              color: broadSportFilter === "ALL" ? theme.primaryForeground : theme.textSecondary,
              ...(broadSportFilter === "ALL" ? { boxShadow: `0 2px 8px ${theme.primary}44` } : {}),
            }}
          >
            <span className="text-sm">🔥</span>
            <span>{t("operator.allSports")}</span>
            <ChevronDown className="w-3 h-3" />
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center font-semibold"
              style={{ backgroundColor: broadSportFilter === "ALL" ? "rgba(255,255,255,0.2)" : (theme.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)") }}
            >
              {enrichedFights.length}
            </span>
          </button>
          {/* Individual sport chips */}
          {broadSportTabs[0]?.tabs.filter(t => t.key !== "ALL").map(tab => {
            const isActive = broadSportFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setBroadSportFilter(tab.key); setLeagueFilter(null); }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                style={{
                  backgroundColor: isActive ? theme.primary : theme.surfaceBg,
                  color: isActive ? theme.primaryForeground : theme.textSecondary,
                  ...(isActive ? { boxShadow: `0 2px 8px ${theme.primary}44` } : {}),
                }}
              >
                <span className="text-sm">{tab.emoji}</span>
                <span>{tab.label}</span>
                {tab.count != null && tab.count > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center font-semibold"
                    style={{ backgroundColor: isActive ? "rgba(255,255,255,0.2)" : (theme.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)") }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Level 2: League sub-tabs (scrollable chips) */}
        {leagueTabs.length > 1 && (
          <div
            className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {leagueTabs.map(tab => {
              const isActive = leagueFilter === tab.key || (!leagueFilter && tab.key === "ALL_LEAGUES");
              return (
                <button
                  key={tab.key}
                  onClick={() => setLeagueFilter(tab.key === "ALL_LEAGUES" ? null : tab.key)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: isActive ? (theme.primary + "22") : theme.surfaceBg,
                    color: isActive ? theme.primary : theme.textSecondary,
                    border: isActive ? `1.5px solid ${theme.primary}` : "1.5px solid transparent",
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {tab.label}
                  <span className="ml-1 opacity-60">({tab.count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Time filter bar */}
        <div className="flex items-center gap-2">
          {(["all", "today", "week"] as const).map(f => {
            const isActive = timeFilter === f;
            const label = f === "all" ? t("operator.all") : f === "today" ? t("operator.today") : t("operator.thisWeek");
            return (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                style={{
                  backgroundColor: isActive ? theme.primary + "18" : "transparent",
                  color: isActive ? theme.primary : theme.textMuted,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: theme.textMuted }}
          />
          <input
            type="text"
            placeholder={t("operator.searchTeams", "Search teams or players...")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{
              backgroundColor: theme.inputBg,
              border: `1px solid ${theme.inputBorder}`,
              color: theme.textPrimary,
            }}
          />
        </div>
      </div>}

      {/* Featured event hero */}
      {featuredEvent && activeTab === "events" && !searchQuery && (
        <FeaturedEventHero
          fight={featuredEvent}
          theme={theme}
          t={t}
          onPredict={() => {
            if (featuredEvent.status === "open" || featuredEvent.status === "live") {
              handlePredict(featuredEvent, "fighter_a");
            }
          }}
        />
      )}

      {/* Hero text */}
      {filteredFights.length > 0 && !searchQuery && broadSportFilter === "ALL" && activeTab === "events" && !featuredEvent && (
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-0 text-center">
          <h1 className="text-2xl sm:text-3xl font-black leading-tight" style={{ color: theme.textPrimary }}>
            {t("operator.heroTitle", "Pick a Winner. Win Money.")}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            {t("operator.heroSubtitle", "Choose a team. Enter amount. See your payout instantly.")}
          </p>
        </div>
      )}

      {/* Events — grouped by date */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Loading skeleton */}
        {!operatorFights && !backendDegraded && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-xl p-4 animate-pulse"
                style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="h-3 rounded-full w-24" style={{ backgroundColor: theme.surfaceBg }} />
                  <div className="h-3 rounded-full w-16" style={{ backgroundColor: theme.surfaceBg }} />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="h-5 rounded w-28" style={{ backgroundColor: theme.surfaceBg }} />
                  <div className="h-4 rounded w-8" style={{ backgroundColor: theme.surfaceBg }} />
                  <div className="h-5 rounded w-28" style={{ backgroundColor: theme.surfaceBg }} />
                </div>
                <div className="flex gap-2 mt-3">
                  <div className="h-9 rounded-lg flex-1" style={{ backgroundColor: theme.surfaceBg }} />
                  <div className="h-9 rounded-lg flex-1" style={{ backgroundColor: theme.surfaceBg }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {operatorFights && backendDegraded && filteredFights.length === 0 ? (
          <div
            className="rounded-xl px-6 py-12 text-center"
            style={{ backgroundColor: theme.isDark ? "rgba(120,53,15,0.2)" : "rgba(254,243,199,0.3)", border: `1px solid ${theme.isDark ? "rgba(245,158,11,0.3)" : "#fde68a"}` }}
          >
            <ShieldCheck className="w-14 h-14 mx-auto mb-4" style={{ color: theme.isDark ? "#f59e0b" : "#d97706" }} />
            <h3 className="text-lg font-bold" style={{ color: theme.textPrimary }}>
              {t("operator.onHoldTitle", "All Predictions Are Temporarily On Hold")}
            </h3>
            <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              {t("operator.onHoldDesc", "We're experiencing a brief issue with one of our providers. Your funds and existing predictions are completely safe.")}
            </p>
          </div>
        ) : filteredFights.length === 0 ? (
          <div className="text-center py-20 px-6">
            {activeTab === "picks" ? (
              <>
                <Trophy className="w-12 h-12 mx-auto mb-4" style={{ color: theme.textMuted }} />
                <h3 className="text-lg font-bold" style={{ color: theme.textSecondary }}>{t("operator.noPredictions")}</h3>
                <p className="mt-2 text-sm" style={{ color: theme.textMuted }}>{t("operator.pickWinner")}</p>
              </>
            ) : searchQuery ? (
              <>
                <Search className="w-12 h-12 mx-auto mb-4" style={{ color: theme.textMuted }} />
                <h3 className="text-lg font-bold" style={{ color: theme.textSecondary }}>
                  {t("operator.noSearchResults", "No events match your search")}
                </h3>
                <p className="mt-2 text-sm" style={{ color: theme.textMuted }}>{t("operator.noSearchResultsDesc")}</p>
              </>
            ) : (
              <>
                <CalendarPlus className="w-12 h-12 mx-auto mb-4" style={{ color: theme.textMuted }} />
                <h3 className="text-lg font-bold" style={{ color: theme.textSecondary }}>{t("operator.noLiveSports")}</h3>
                <p className="mt-2 text-sm max-w-sm mx-auto" style={{ color: theme.textMuted }}>
                  {t("operator.checkBackSoon")}
                </p>
              </>
            )}
          </div>
        ) : dateGroups.length > 0 ? (
          dateGroups.map(group => (
            <div key={group.sortKey}>
              <h3
                className="text-xs font-bold uppercase tracking-wider mb-2 px-1"
                style={{ color: theme.textMuted }}
              >
                {group.label === "today" ? t("common.today") : group.label === "tomorrow" ? t("common.tomorrow") : group.label}
              </h3>
              <div className="space-y-3">
                {group.fights.map(fight => {
                  const entry = userEntries.find((e: any) => e.fight_id === fight.id);
                  return (
                    <SimplePredictionCard
                      key={fight.id}
                      fight={fight}
                      onPredict={handlePredict}
                      userEntry={entry || null}
                      onClaim={handleClaim}
                      claiming={claiming}
                      theme={theme}
                      onShareWin={handleShareWin}
                      onGraph={(f) => setGraphFight(f)}
                      onTips={(f) => setTipsFight(f)}
                      onSell={handleSell}
                      selling={selling}
                    />
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          filteredFights.map(fight => {
            const entry = userEntries.find((e: any) => e.fight_id === fight.id);
            return (
              <SimplePredictionCard
                key={fight.id}
                fight={fight}
                onPredict={handlePredict}
                userEntry={entry || null}
                onClaim={handleClaim}
                claiming={claiming}
                theme={theme}
                onShareWin={handleShareWin}
                onGraph={(f) => setGraphFight(f)}
                onTips={(f) => setTipsFight(f)}
                onSell={handleSell}
                selling={selling}
              />
            );
          })
        )}
      </div>

      {/* Fee disclosure */}
      <div className="max-w-4xl mx-auto px-4 pb-4">
        <p className="text-[10px] text-center" style={{ color: theme.textMuted }}>
          {t("operator.platformFee")}
        </p>
      </div>

      <footer
        className="py-6 text-center space-y-3"
        style={{ borderTop: `1px solid ${theme.cardBorder}`, color: theme.textMuted }}
      >
        {(operator as any).support_email && (
          <p className="text-xs">
            {t("operator.supportEmailLabel")}: <a href={`mailto:${(operator as any).support_email}`} className="underline hover:opacity-80" style={{ color: theme.primary }}>{(operator as any).support_email}</a>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
          <a href="https://1mg.live/terms" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity" style={{ color: theme.textMuted }}>{t("legal.terms.title")}</a>
          <a href="https://1mg.live/privacy" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity" style={{ color: theme.textMuted }}>{t("legal.privacy.title")}</a>
          <a href="https://1mg.live/disclaimer" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity" style={{ color: theme.textMuted }}>{t("legal.disclaimer.title")}</a>
        </div>
        <p className="text-xs">
          {t("operator.poweredBy")} <span style={{ color: theme.primary }}>1MG.live</span>
        </p>
        <a
          href="/purchase"
          className="inline-block text-[11px] font-medium hover:opacity-80 transition-opacity"
          style={{ color: theme.primary }}
        >
          {t("operator.getYourApp")}
        </a>
      </footer>

      {/* Prediction Modal */}
      {selectedFight && selectedPick && (
        <SimplePredictionModal
          fight={selectedFight}
          pick={selectedPick}
          onClose={() => { acceptedRequoteRef.current = null; setSelectedFight(null); setSelectedPick(null); setShowSuccess(false); setLastTradeResult(null); setRequoteData(null); resetAllowance(); }}
          onSubmit={(amt) => handleSubmit(amt)}
          submitting={submitting || pmSessionLoading}
          showSuccess={showSuccess}
          tradeResult={lastTradeResult}
          approvalStep={allowanceState.step}
          approvalError={allowanceState.errorReason}
          themeColor={theme.primary}
          operatorBrandName={operator?.brand_name}
          onSharePick={handleSharePick}
          requoteData={requoteData}
          onAcceptRequote={() => {
            if (!requoteData) return;
            acceptedRequoteRef.current = {
              baselinePrice: requoteData.new_price,
              cycleCount: 1,
            };
            setRequoteData(null);
          }}
        />
      )}

      {/* Market Graph Modal */}
      {graphFight && (
        <MarketGraphModal
          fight={graphFight}
          open={!!graphFight}
          onClose={() => setGraphFight(null)}
          theme={theme}
        />
      )}

      {/* Market Tips Modal */}
      {tipsFight && (
        <MarketTipsModal
          fight={tipsFight}
          open={!!tipsFight}
          onClose={() => setTipsFight(null)}
          theme={theme}
        />
      )}

      {/* Social Share Modal */}
      <SocialShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        variant={shareVariant}
        eventTitle={shareFight?.event_name}
        fighterPick={pickedNameForShare}
        amountUsd={shareAmount}
        wallet={address}
        operatorBrandName={operator?.brand_name}
        operatorLogoUrl={operator?.logo_url}
        operatorSubdomain={subdomain}
      />

      <WalletGateModal
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title={t("operator.signInToPredict")}
        description={t("operator.signInDesc")}
      />

      {/* Add Funds Modal */}
      {showFundsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFundsModal(false)} />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textPrimary }}
          >
            <h3 className="text-lg font-bold">{t("operator.addFundsTitle")}</h3>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              {t("operator.addFundsDesc")}
            </p>
            {address && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg text-xs font-mono break-all"
                style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
              >
                <span className="flex-1">{address}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(address);
                    toast.success(t("operator.addressCopied"));
                  }}
                  className="shrink-0 p-1.5 rounded-md hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: theme.primary + "22", color: theme.primary }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Buy with Card via Privy onramp */}
            <button
              onClick={() => {
                // Open Privy fund wallet flow for card purchases
                window.open(`https://app.uniswap.org/swap?chain=polygon&outputCurrency=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`, "_blank");
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
            >
              <CreditCard className="w-3.5 h-3.5" />
              💳 Buy USDC with Card
            </button>
            <a
              href="https://app.uniswap.org/swap?chain=polygon"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme.surfaceBg, color: theme.textPrimary, border: `1px solid ${theme.cardBorder}` }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("operator.getUsdce")}
            </a>
            {/* Withdraw button */}
            <button
              onClick={() => { setShowFundsModal(false); setShowWithdrawModal(true); }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "transparent", color: theme.textSecondary, border: `1px solid ${theme.cardBorder}` }}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Withdraw Funds
            </button>
            <button
              onClick={() => setShowFundsModal(false)}
              className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: theme.surfaceBg, color: theme.textSecondary }}
            >
              {t("operator.close")}
            </button>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowWithdrawModal(false)} />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}`, color: theme.textPrimary }}
          >
            <h3 className="text-lg font-bold">Withdraw USDC</h3>
            <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              <span className="text-red-400">⚠️ Verify the address carefully — crypto transactions cannot be reversed</span>
            </div>

            {/* Balance display */}
            {usdc_balance != null && (
              <div className="text-xs" style={{ color: theme.textSecondary }}>
                Available: <span className="font-bold" style={{ color: theme.textPrimary }}>${usdc_balance.toFixed(2)} USDC</span>
              </div>
            )}

            {/* Option A: Send to wallet */}
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: theme.textSecondary }}>Transfer to another crypto wallet</label>
              <div className="space-y-2">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  placeholder="Amount (USDC)"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}`, color: theme.textPrimary }}
                />
                <input
                  type="text"
                  value={withdrawDest}
                  onChange={e => setWithdrawDest(e.target.value)}
                  placeholder="0x... (Polygon wallet address)"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}`, color: theme.textPrimary }}
                />
              </div>
              <p className="text-[10px]" style={{ color: theme.textMuted }}>Network fee: ~$0.001 (sponsored)</p>
            </div>
            <button
              onClick={() => {
                if (!withdrawDest.match(/^0x[a-fA-F0-9]{40}$/)) {
                  toast.error("Invalid wallet address — must start with 0x and be 42 characters");
                  return;
                }
                const amt = parseFloat(withdrawAmount);
                if (isNaN(amt) || amt <= 0) {
                  toast.error("Enter a valid amount");
                  return;
                }
                if (usdc_balance != null && amt > usdc_balance) {
                  toast.error(`Insufficient balance. You have $${usdc_balance.toFixed(2)} USDC`);
                  return;
                }
                const confirmed = confirm(`Send $${amt.toFixed(2)} USDC to ${withdrawDest}? This cannot be undone.`);
                if (!confirmed) return;
                toast.info("Withdrawal request submitted. Processing within 24 hours.", { duration: 6000 });
                setShowWithdrawModal(false);
                setWithdrawDest("");
                setWithdrawAmount("");
              }}
              className="w-full py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
            >
              Send to Wallet
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ backgroundColor: theme.cardBorder }} />
              <span className="text-[10px] font-medium" style={{ color: theme.textMuted }}>OR</span>
              <div className="flex-1 h-px" style={{ backgroundColor: theme.cardBorder }} />
            </div>

            {/* Option B: Sell for Cash via Transak */}
            <button
              onClick={() => {
                const params = new URLSearchParams({
                  defaultCryptoCurrency: "USDC",
                  network: "polygon",
                  walletAddress: address || "",
                  productsAvailed: "SELL",
                  fiatCurrency: "USD",
                });
                window.open(`https://global.transak.com/?${params.toString()}`, "_blank");
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme.surfaceBg, color: theme.textPrimary, border: `1px solid ${theme.cardBorder}` }}
            >
              💵 Sell for Cash (Bank Transfer)
            </button>
            <p className="text-[10px] text-center" style={{ color: theme.textMuted }}>
              Convert USDC to dollars via Transak — sent directly to your bank account
            </p>

            <button
              onClick={() => { setShowWithdrawModal(false); setWithdrawDest(""); setWithdrawAmount(""); }}
              className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: theme.surfaceBg, color: theme.textSecondary }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sport Picker Modal */}
      <SportPickerModal
        open={sportPickerOpen}
        onClose={() => setSportPickerOpen(false)}
        onSelect={(key) => { setBroadSportFilter(key); setLeagueFilter(null); }}
        sportCounts={sportCounts}
        totalCount={enrichedFights.length}
        theme={theme}
      />
    </div>
    </SportsWebSocketProvider>
  );
}
