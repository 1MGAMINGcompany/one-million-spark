import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Globe, Trophy, Loader2, ShieldCheck, Search, ChevronDown, CalendarPlus } from "lucide-react";
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
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult } from "@/components/predictions/tradeResultTypes";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import {
  normalizeOperatorSport,
  isValidOperatorEvent,
  isEventDateRelevant,
  OPERATOR_SPORT_EMOJI,
} from "@/lib/operatorSportRules";
import { getOperatorTheme } from "@/lib/operatorThemes";
import { groupByLeague } from "@/lib/soccerLeagues";

interface OperatorAppProps {
  subdomain: string;
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
  const [sportFilter, setSportFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"events" | "picks">("events");
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const [graphFight, setGraphFight] = useState<Fight | null>(null);
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);

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
      const { data } = await (supabase as any)
        .from("prediction_fights")
        .select("*, prediction_events!event_id(category)")
        .or(`operator_id.eq.${operator!.id},and(operator_id.is.null,visibility.in.(platform,all))`)
        .in("status", ["open", "live", "locked"])
        .not("event_date", "is", null)
        .order("event_date", { ascending: true })
        .limit(200);
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
    const { data } = await supabase.from("prediction_entries").select("*").eq("wallet", address);
    if (data) setUserEntries(data);
  }, [address]);

  useEffect(() => { loadUserEntries(); }, [loadUserEntries]);

  // ── STRICT client-side validation pipeline ──
  const allFights = useMemo(() => {
    return (operatorFights || []).filter(f => {
      if (!isValidOperatorEvent(f as any)) return false;
      if (!isEventDateRelevant((f as any).event_date)) return false;
      const sport = normalizeOperatorSport(f.event_name, (f as any).sport ?? (f as any)._category ?? null);
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

  // DEBUG: confirm sport detection (temporary)
  useEffect(() => {
    if (allFights.length > 0) {
      const sports = Array.from(new Set(allFights.map(f =>
        normalizeOperatorSport(f.event_name, (f as any).sport ?? (f as any)._category ?? null)
      )));
      console.log("SPORTS DETECTED:", sports);
      console.log("EVENTS:", allFights.length, "total");
    }
  }, [allFights]);

  // ── Build sport tab groups ──
  const sportTabGroups = useMemo<SportTabGroup[]>(() => {
    const sportCounts: Record<string, number> = {};
    allFights.forEach(f => {
      const sport = normalizeOperatorSport(f.event_name, (f as any).sport ?? (f as any)._category ?? null) || "OTHER";
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;
    });
    const tabs = Object.entries(sportCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([sport, count]) => ({
        key: sport,
        label: sport,
        emoji: OPERATOR_SPORT_EMOJI[sport] || "🏆",
        count,
      }));
    return [{
      label: "Sports",
      tabs: [{ key: "ALL", label: "All Sports", emoji: "🔥", count: allFights.length }, ...tabs],
    }];
  }, [allFights]);

  const allSportTabs = sportTabGroups[0]?.tabs || [];

  // Filtered fights
  const filteredFights = useMemo(() => {
    let fights = allFights;
    if (activeTab === "picks") {
      const userFightIds = new Set(userEntries.map((e: any) => e.fight_id));
      fights = fights.filter(f => userFightIds.has(f.id));
    }
    if (sportFilter !== "ALL") {
      fights = fights.filter(f => normalizeOperatorSport(f.event_name, (f as any).sport ?? (f as any)._category ?? null) === sportFilter);
    }
    if (dateFilter === "today") {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      fights = fights.filter(f => {
        const ed = (f as any).event_date;
        if (!ed) return false;
        const d = new Date(ed);
        return d >= todayStart && d <= todayEnd;
      });
    } else if (dateFilter === "week") {
      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * 86400000);
      fights = fights.filter(f => {
        const ed = (f as any).event_date;
        if (!ed) return true;
        return new Date(ed) <= weekEnd;
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
    // Apply league filter for soccer
    if (leagueFilter && sportFilter === "SOCCER") {
      const { extractSoccerLeague } = require("@/lib/soccerLeagues");
      fights = fights.filter((f: any) => extractSoccerLeague(f.event_name, f._category) === leagueFilter);
    }
    return fights;
  }, [allFights, sportFilter, dateFilter, searchQuery, activeTab, userEntries, leagueFilter]);

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
      toast.error(t("operator.predictionFailed"), { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePredict = (fight: Fight, pick: "fighter_a" | "fighter_b" | "draw") => {
    if (fight.status !== "open") {
      toast.error(t("operator.predictionsClosed"));
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
    toast.info("To add funds, send USDC.e (Polygon) to your wallet address.");
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
      <div className="min-h-screen bg-[#06080f] text-white flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-md space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-2">
            <Globe className="w-8 h-8 text-white/20" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">This app does not exist</h1>
          <p className="text-white/50 text-base sm:text-lg leading-relaxed">
            Start your own predictions app in minutes — no code, no setup, just launch.
          </p>
          <a
            href="https://1mg.live"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-base font-bold text-black transition-all duration-200 hover:scale-[1.02] shadow-lg"
            style={{ background: "linear-gradient(135deg, #d4a017, #f5c842)" }}
          >
            BUY YOUR APP — $2,400 USDC
          </a>
          <p className="text-white/30 text-xs">
            Powered by <a href="https://1mg.live" className="underline hover:text-white/50">1MG</a>
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
                {tab === "events" ? "Events" : `My Picks${userEntries.length > 0 ? ` (${userEntries.length})` : ""}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sport Tabs + Filters */}
      <div className="max-w-4xl mx-auto px-4 pt-3">
        {isMobile ? (
          <div className="relative">
            <button
              onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm"
              style={{
                backgroundColor: theme.surfaceBg,
                border: `1px solid ${theme.cardBorder}`,
                color: theme.textPrimary,
              }}
            >
              <span>
                {(allSportTabs.find(t => t.key === sportFilter)?.emoji || "🔥")}{" "}
                {sportFilter === "ALL" ? "All Sports" : sportFilter}{" "}
                <span style={{ color: theme.textMuted }}>
                  ({allSportTabs.find(t => t.key === sportFilter)?.count || 0})
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${mobileDropdownOpen ? "rotate-180" : ""}`}
                style={{ color: theme.textMuted }}
              />
            </button>
            {mobileDropdownOpen && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-lg z-30 max-h-60 overflow-y-auto"
                style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
              >
                {allSportTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setSportFilter(tab.key); setLeagueFilter(null); setMobileDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                    style={{
                      color: sportFilter === tab.key ? theme.textPrimary : theme.textSecondary,
                      backgroundColor: sportFilter === tab.key ? theme.surfaceBg : "transparent",
                    }}
                  >
                    {tab.emoji} {tab.label}{" "}
                    <span style={{ color: theme.textMuted }}>({tab.count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ScrollableSportTabs
            groups={sportTabGroups}
            activeTab={sportFilter}
            onTabChange={(key) => { setSportFilter(key); setLeagueFilter(null); }}
          />
        )}

        {/* League sub-tabs for Soccer */}
        {sportFilter === "SOCCER" && (() => {
          const soccerFights = allFights.filter(f =>
            normalizeOperatorSport(f.event_name, (f as any).sport ?? (f as any)._category ?? null) === "SOCCER"
          );
          const leagueGroups = groupByLeague(soccerFights as any);
          if (leagueGroups.length <= 1) return null;
          return (
            <div className="flex gap-2 overflow-x-auto mt-2 pb-1 scrollbar-hide">
              <button
                onClick={() => setLeagueFilter(null)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                style={{
                  backgroundColor: !leagueFilter ? theme.primary : theme.surfaceBg,
                  color: !leagueFilter ? theme.primaryForeground : theme.textSecondary,
                }}
              >
                All Leagues ({soccerFights.length})
              </button>
              {leagueGroups.map(lg => (
                <button
                  key={lg.league}
                  onClick={() => setLeagueFilter(lg.league)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: leagueFilter === lg.league ? theme.primary : theme.surfaceBg,
                    color: leagueFilter === lg.league ? theme.primaryForeground : theme.textSecondary,
                  }}
                >
                  {lg.league} ({lg.fights.length})
                </button>
              ))}
            </div>
          );
        })()}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
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
          <div className="flex gap-1">
            {(["all", "today", "week"] as const).map(df => (
              <button
                key={df}
                onClick={() => setDateFilter(df)}
                className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: dateFilter === df ? theme.surfaceBg : "transparent",
                  color: dateFilter === df ? theme.textPrimary : theme.textMuted,
                }}
              >
                {df === "all" ? t("operator.allDates", "All") : df === "today" ? t("operator.today", "Today") : t("operator.thisWeek", "This Week")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero text */}
      {filteredFights.length > 0 && !searchQuery && sportFilter === "ALL" && activeTab === "events" && (
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-0 text-center">
          <h1 className="text-2xl sm:text-3xl font-black leading-tight" style={{ color: theme.textPrimary }}>
            {t("operator.heroTitle", "Pick a Winner. Win Money.")}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            {t("operator.heroSubtitle", "Choose a team. Enter amount. See your payout instantly.")}
          </p>
        </div>
      )}

      {/* Events */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {backendDegraded && filteredFights.length === 0 ? (
          <div
            className="rounded-xl px-6 py-12 text-center"
            style={{ backgroundColor: theme.isDark ? "rgba(120,53,15,0.2)" : "rgba(254,243,199,0.3)", border: `1px solid ${theme.isDark ? "rgba(245,158,11,0.3)" : "#fde68a"}` }}
          >
            <ShieldCheck className="w-14 h-14 mx-auto mb-4 text-amber-500" />
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
                <h3 className="text-lg font-bold" style={{ color: theme.textSecondary }}>No predictions placed yet</h3>
                <p className="mt-2 text-sm" style={{ color: theme.textMuted }}>Pick a winner from the events tab to get started.</p>
              </>
            ) : searchQuery ? (
              <>
                <Search className="w-12 h-12 mx-auto mb-4" style={{ color: theme.textMuted }} />
                <h3 className="text-lg font-bold" style={{ color: theme.textSecondary }}>
                  {t("operator.noSearchResults", "No events match your search")}
                </h3>
                <p className="mt-2 text-sm" style={{ color: theme.textMuted }}>Try a different team or player name.</p>
              </>
            ) : (
              <>
                <CalendarPlus className="w-12 h-12 mx-auto mb-4" style={{ color: theme.textMuted }} />
                <h3 className="text-lg font-bold" style={{ color: theme.textSecondary }}>No live sports available right now</h3>
                <p className="mt-2 text-sm max-w-sm mx-auto" style={{ color: theme.textMuted }}>
                  New matchups will appear here as soon as they open. Check back soon.
                </p>
              </>
            )}
          </div>
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
        className="py-6 text-center space-y-2"
        style={{ borderTop: `1px solid ${theme.cardBorder}`, color: theme.textMuted }}
      >
        <p className="text-xs">
          {t("operator.poweredBy")} <span style={{ color: theme.primary }}>1MG.live</span>
        </p>
        <a
          href="/purchase"
          className="inline-block text-[11px] font-medium hover:opacity-80 transition-opacity"
          style={{ color: theme.primary }}
        >
          Get Your Own Predictions App →
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
    </div>
  );
}
