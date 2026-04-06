import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { SportsWebSocketProvider, useLiveGameState } from "@/hooks/useSportsWebSocket";
import LiveGameBadge, { LiveScoreDisplay } from "@/components/predictions/LiveGameBadge";
import { useTranslation } from "react-i18next";
import { useOperatorBySubdomain, useOperatorSettings } from "@/hooks/useOperator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useAllowanceGate } from "@/hooks/useAllowanceGate";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { usePolymarketSession } from "@/hooks/usePolymarketSession";
import { usePolymarketPrices } from "@/hooks/usePolymarketPrices";
import { useIsMobile } from "@/hooks/use-mobile";
import { Globe, Trophy, Loader2, ShieldCheck, Search, CalendarPlus, ChevronDown, Zap, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";
import { Button } from "@/components/ui/button";
import SimplePredictionCard from "@/components/operator/SimplePredictionCard";
import SimplePredictionModal from "@/components/operator/SimplePredictionModal";
import OperatorBalanceBanner from "@/components/operator/OperatorBalanceBanner";
import MarketGraphModal from "@/components/operator/MarketGraphModal";
import SocialShareModal, { type ShareVariant } from "@/components/SocialShareModal";
import { WalletGateModal } from "@/components/WalletGateModal";
import PlatformLanguageSwitcher from "@/components/PlatformLanguageSwitcher";
import ScrollableSportTabs, { type SportTabGroup } from "@/components/admin/ScrollableSportTabs";
import SportPickerModal from "@/components/operator/SportPickerModal";
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult } from "@/components/predictions/tradeResultTypes";
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

  const { authenticated, login, getAccessToken } = usePrivy();
  const { walletAddress: address, eoaAddress, isPrivyUser } = usePrivyWallet();
  const { state: allowanceState, ensureAllowance, reset: resetAllowance } = useAllowanceGate();
  const { usdc_balance } = usePolygonUSDC();
  const { hasSession, canTrade, setupTradingWallet } = usePolymarketSession();
  usePolymarketPrices();

  const isConnected = authenticated && isPrivyUser;

  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [selectedPick, setSelectedPick] = useState<"fighter_a" | "fighter_b" | "draw" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<TradeResult | null>(null);
  const [showWalletGate, setShowWalletGate] = useState(false);
  const [userEntries, setUserEntries] = useState<any[]>([]);
  const [claiming, setClaiming] = useState(false);
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
  const [sportPickerOpen, setSportPickerOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week">("all");
  const [showFundsModal, setShowFundsModal] = useState(false);

  // Social share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVariant, setShareVariant] = useState<ShareVariant>("prediction");
  const [shareFight, setShareFight] = useState<Fight | null>(null);
  const [shareAmount, setShareAmount] = useState<number | undefined>();

  const theme = getOperatorTheme(operator?.theme);

  // ── STRICT event query ──
  const { data: operatorFights, isError: opFightsError } = useQuery({
    queryKey: ["operator_fights", operator?.id],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await (supabase as any)
        .from("prediction_fights")
        .select("*, prediction_events!event_id(category)")
        .or(`operator_id.eq.${operator!.id},and(operator_id.is.null,visibility.in.(platform,all))`)
        .in("status", ["open", "live", "locked"])
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
    refetchInterval: 15000,
  });

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
    staleTime: 30_000,
  });

  // ── STRICT client-side validation pipeline ──
  const allFights = useMemo(() => {
    return (operatorFights || []).filter(f => {
      if (!isValidOperatorEvent(f as any)) return false;
      const eventDate = (f as any).event_date;
      if (!eventDate) return false;
      const d = new Date(eventDate);
      if (isNaN(d.getTime())) return false;
      // Keep any event with an active status visible, hide only truly past non-active events
      const isActive = ["live", "open", "locked"].includes(f.status);
      const isFuture = d.getTime() > Date.now();
      if (!isActive && !isFuture) return false;
      // Hide stale events where game likely ended (safety net for slow settlement)
      const eventAgeMs = Date.now() - d.getTime();
      // Use polymarket_last_synced_at to detect truly stale/finished games:
      // If prices haven't been synced in 30+ minutes AND game started 2h+ ago, it's done
      const lastSync = (f as any).polymarket_last_synced_at;
      const syncAgeMs = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
      const pricesStale = syncAgeMs > 30 * 60_000; // 30 minutes
      // Games started 2h+ ago with stale prices are finished
      if ((f.status === "locked" || f.status === "live") && eventAgeMs > 2 * 3600_000 && pricesStale) return false;
      // Hard cutoff: any locked/live event older than 5h regardless
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
  }, [operatorFights, allowedSports, disabledSports, operator?.id]);

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

  // Collect polymarket slugs for live tracking
  const liveSlugs = useMemo(() => {
    return enrichedFights
      .map(f => (f as any).polymarket_slug)
      .filter((s): s is string => !!s);
  }, [enrichedFights]);

  const handleSubmit = async (amountUsd: number) => {
    if (!selectedFight || !selectedPick || !isConnected || !address) return;
    setSubmitting(true);
    resetAllowance();
    try {
      const privyToken = await getAccessToken();
      if (!privyToken) {
        toast.error(t("operator.sessionExpired"), { description: t("operator.pleaseLoginAgain") });
        setSubmitting(false);
        return;
      }
      const feeRate = selectedFight.commission_bps != null
        ? selectedFight.commission_bps / 10_000
        : (selectedFight.source === "polymarket" ? 0.02 : 0.05);
      const feeUsdc = amountUsd * feeRate;
      if (feeUsdc > 0.01) {
        const approved = await ensureAllowance(feeUsdc);
        if (!approved) { setSubmitting(false); return; }
      }
      const { data, error } = await supabase.functions.invoke("prediction-submit", {
        body: {
          fight_id: selectedFight.id,
          wallet: address,
          wallet_eoa: eoaAddress ?? undefined,
          fighter_pick: selectedPick,
          amount_usd: amountUsd,
          chain: "polygon",
          source_operator_id: operator?.id,
        },
        headers: { "x-privy-token": privyToken },
      });
      if (error || data?.error) {
        const msg = data?.error || error?.message || "Backend error";
        const errorCode = data?.error_code || "";
        if (errorCode === "trading_wallet_setup_required") {
          toast.error(t("operator.tradingWalletNeeded"));
          setupTradingWallet().catch(() => {});
          setSubmitting(false);
          return;
        }
        throw new Error(msg);
      }
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
    } catch (err: any) {
      const msg = err.message || "";
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
    <SportsWebSocketProvider slugs={liveSlugs}>
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
              <span className="text-xs font-mono" style={{ color: theme.textMuted }}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
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

      {/* Balance banner */}
      {isConnected && (
        <OperatorBalanceBanner
          balanceUsdce={usdc_balance}
          theme={theme}
          onAddFunds={handleAddFunds}
        />
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

      {/* Level 1: Broad Sport Tabs (scrollable chips) */}
      <div className="max-w-4xl mx-auto px-4 pt-3 space-y-2">
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
      </div>

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
          onClose={() => { setSelectedFight(null); setSelectedPick(null); setShowSuccess(false); setLastTradeResult(null); resetAllowance(); }}
          onSubmit={handleSubmit}
          submitting={submitting}
          showSuccess={showSuccess}
          tradeResult={lastTradeResult}
          approvalStep={allowanceState.step}
          approvalError={allowanceState.errorReason}
          themeColor={theme.primary}
          operatorBrandName={operator?.brand_name}
          onSharePick={handleSharePick}
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
            <a
              href="https://app.uniswap.org/swap?chain=polygon"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("operator.getUsdce")}
            </a>
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
