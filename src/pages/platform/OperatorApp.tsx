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
import { Globe, Trophy, Loader2, ShieldCheck, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SimplePredictionCard from "@/components/operator/SimplePredictionCard";
import SimplePredictionModal from "@/components/operator/SimplePredictionModal";
import OperatorBalanceBanner from "@/components/operator/OperatorBalanceBanner";
import SocialShareModal, { type ShareVariant } from "@/components/SocialShareModal";
import { WalletGateModal } from "@/components/WalletGateModal";
import PlatformLanguageSwitcher from "@/components/PlatformLanguageSwitcher";
import ScrollableSportTabs, { type SportTabGroup } from "@/components/admin/ScrollableSportTabs";
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult } from "@/components/predictions/tradeResultTypes";
import { isPropMarket } from "@/lib/detectSport";
import { getTeamLogo } from "@/lib/teamLogos";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";

/** Inline parseSport for operator app - avoids importing EventSection */
function parseSport(eventName: string, _sp?: string | null, _cat?: string | null): string {
  const upper = eventName.toUpperCase();
  if (["MLS","SOCCER","FUTBOL","PREMIER LEAGUE","LA LIGA","CHAMPIONS LEAGUE","SERIE A","BUNDESLIGA","LIGUE 1","EPL","COPA","LIGA MX"].some(k => upper.includes(k))) return "FUTBOL";
  if (["UFC","MMA","PFL","BELLATOR"].some(k => upper.includes(k))) return "MMA";
  if (upper.includes("BOXING")) return "BOXING";
  if (upper.includes("MUAY THAI")) return "MUAY THAI";
  if (upper.includes("BARE KNUCKLE") || upper.includes("BKFC")) return "BARE KNUCKLE";
  if (upper.includes("NFL")) return "NFL";
  if (upper.includes("NBA")) return "NBA";
  if (upper.includes("NCAA")) return "NCAA";
  if (upper.includes("NHL")) return "NHL";
  if (upper.includes("MLB")) return "MLB";
  if (upper.includes("TENNIS") || upper.includes("ATP") || upper.includes("WTA")) return "TENNIS";
  if (upper.includes("GOLF") || upper.includes("PGA")) return "GOLF";
  if (upper.includes("F1") || upper.includes("FORMULA")) return "F1";
  if (upper.includes("CRICKET") || upper.includes("IPL")) return "CRICKET";
  if (upper.includes("RUGBY")) return "RUGBY";
  return eventName.split(' — ')[0] || "OTHER";
}

const THEME_MAP: Record<string, { primary: string; bg: string; card: string }> = {
  blue: { primary: "#3b82f6", bg: "#06080f", card: "rgba(255,255,255,0.03)" },
  gold: { primary: "#d4a017", bg: "#0a0a0a", card: "rgba(255,255,255,0.03)" },
  red: { primary: "#ef4444", bg: "#0a0a0f", card: "rgba(255,255,255,0.03)" },
};

const SPORT_EMOJI: Record<string, string> = {
  nba: "🏀", nhl: "🏒", mlb: "⚾", nfl: "🏈", mls: "⚽", soccer: "⚽",
  futbol: "⚽", ufc: "🥊", mma: "🥊", boxing: "🥊", tennis: "🎾", cricket: "🏏",
  golf: "⛳", f1: "🏎️", rugby: "🏉", ncaa: "🎓",
};

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
  const { relayer_allowance, usdc_balance } = usePolygonUSDC();
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

  // Social share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVariant, setShareVariant] = useState<ShareVariant>("prediction");
  const [shareFight, setShareFight] = useState<Fight | null>(null);
  const [shareAmount, setShareAmount] = useState<number | undefined>();

  const { data: operatorFights, isError: opFightsError } = useQuery({
    queryKey: ["operator_fights", operator?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("prediction_fights")
        .select("*")
        .or(`operator_id.eq.${operator!.id},and(operator_id.is.null,visibility.in.(platform,all))`)
        .not("status", "eq", "draft")
        .order("event_date", { ascending: true });
      return (data || []) as Fight[];
    },
    enabled: !!operator?.id,
    refetchInterval: 15000,
  });

  const allowedSports = settings?.allowed_sports || [];
  const backendDegraded = opFightsError;

  const loadUserEntries = useCallback(async () => {
    if (!address) return;
    const { data } = await supabase.from("prediction_entries").select("*").eq("wallet", address);
    if (data) setUserEntries(data);
  }, [address]);

  useEffect(() => { loadUserEntries(); }, [loadUserEntries]);

  const allFights = useMemo(() => {
    let fights = (operatorFights || []).filter(f => !isPropMarket(f));
    if (allowedSports.length > 0) {
      fights = fights.filter(f => {
        if ((f as any).operator_id === operator?.id) return true;
        const sport = parseSport(f.event_name, null, null);
        const sportLower = sport.toLowerCase();
        return allowedSports.some(s => s.toLowerCase() === sportLower || sportLower.includes(s.toLowerCase()));
      });
    }
    return fights;
  }, [operatorFights, allowedSports, operator?.id]);

  // Build sport tab groups
  const sportTabGroups = useMemo<SportTabGroup[]>(() => {
    const sportCounts: Record<string, number> = {};
    allFights.forEach(f => {
      const sport = parseSport(f.event_name, null, null);
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;
    });
    const tabs = Object.entries(sportCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([sport, count]) => ({
        key: sport,
        label: sport,
        emoji: SPORT_EMOJI[sport.toLowerCase()] || "🏆",
        count,
      }));
    return [{
      label: "Sports",
      tabs: [{ key: "ALL", label: "All", emoji: "🔥", count: allFights.length }, ...tabs],
    }];
  }, [allFights]);

  const allSportTabs = sportTabGroups[0]?.tabs || [];

  // Filtered fights
  const filteredFights = useMemo(() => {
    let fights = allFights;

    // My Picks filter
    if (activeTab === "picks") {
      const userFightIds = new Set(userEntries.map((e: any) => e.fight_id));
      fights = fights.filter(f => userFightIds.has(f.id));
    }

    if (sportFilter !== "ALL") {
      fights = fights.filter(f => parseSport(f.event_name, null, null) === sportFilter);
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
    return fights;
  }, [allFights, sportFilter, dateFilter, searchQuery, activeTab, userEntries]);


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
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
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
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            This app does not exist
          </h1>
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
            Powered by{" "}
            <a href="https://1mg.live" className="underline hover:text-white/50">
              1MG
            </a>
          </p>
        </div>
      </div>
    );
  }

  const theme = THEME_MAP[operator.theme] || THEME_MAP.blue;

  const pickedNameForShare = shareFight && selectedPick
    ? (selectedPick === "draw" ? "Draw" : resolveOutcomeName(
        selectedPick === "fighter_a" ? shareFight.fighter_a_name : shareFight.fighter_b_name,
        selectedPick === "fighter_a" ? "a" : "b",
        shareFight
      ))
    : undefined;

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: theme.bg }}>
      {/* Navbar */}
      <nav className="border-b border-white/5 backdrop-blur-xl sticky top-0 z-40" style={{ backgroundColor: `${theme.bg}cc` }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {operator.logo_url && (
              <img src={operator.logo_url} alt={operator.brand_name} className="h-7 w-7 rounded-lg object-contain" />
            )}
            <span className="font-bold text-base">{operator.brand_name}</span>
          </div>
          <div className="flex items-center gap-3">
            <PlatformLanguageSwitcher />
            {isConnected && address ? (
              <span className="text-xs text-white/40 font-mono">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            ) : (
              <Button
                onClick={login}
                size="sm"
                className="text-xs font-bold border-0"
                style={{ backgroundColor: theme.primary }}
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
          themeColor={theme.primary}
          onAddFunds={handleAddFunds}
        />
      )}

      {/* Tab bar: Events | My Picks */}
      {isConnected && (
        <div className="max-w-4xl mx-auto px-4 pt-3">
          <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("events")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "events" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              Events
            </button>
            <button
              onClick={() => setActiveTab("picks")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "picks" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              My Picks {userEntries.length > 0 && `(${userEntries.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Sport Tabs + Filters */}
      <div className="max-w-4xl mx-auto px-4 pt-3">
        {isMobile ? (
          /* Mobile: dropdown select */
          <div className="relative">
            <button
              onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
            >
              <span>
                {(allSportTabs.find(t => t.key === sportFilter)?.emoji || "🔥")}{" "}
                {sportFilter === "ALL" ? "All Sports" : sportFilter}{" "}
                <span className="text-white/30">({allSportTabs.find(t => t.key === sportFilter)?.count || 0})</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${mobileDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {mobileDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d1117] border border-white/10 rounded-lg z-30 max-h-60 overflow-y-auto">
                {allSportTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setSportFilter(tab.key); setMobileDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      sportFilter === tab.key ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {tab.emoji} {tab.label} <span className="text-white/30">({tab.count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ScrollableSportTabs
            groups={sportTabGroups}
            activeTab={sportFilter}
            onTabChange={setSportFilter}
          />
        )}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder={t("operator.searchTeams", "Search teams or players...")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "today", "week"] as const).map(df => (
              <button
                key={df}
                onClick={() => setDateFilter(df)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  dateFilter === df
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                {df === "all" ? t("operator.allDates", "All") : df === "today" ? t("operator.today", "Today") : t("operator.thisWeek", "This Week")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero text */}
      {filteredFights.length > 0 && !searchQuery && sportFilter === "ALL" && activeTab === "events" && (
        <div className="max-w-4xl mx-auto px-4 pt-2 pb-0 text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            {t("operator.heroTitle", "Pick a Winner. Win Money.")}
          </h1>
          <p className="text-sm text-white/40 mt-1">
            {t("operator.heroSubtitle", "Choose a team. Enter amount. See your payout instantly.")}
          </p>
        </div>
      )}

      {/* Events */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {backendDegraded && filteredFights.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-6 py-12 text-center">
            <ShieldCheck className="w-14 h-14 mx-auto mb-4 text-amber-400" />
            <h3 className="text-lg font-bold text-white">{t("operator.onHoldTitle", "All Predictions Are Temporarily On Hold")}</h3>
            <p className="mt-2 text-sm text-white/60 max-w-md mx-auto">
              {t("operator.onHoldDesc", "We're experiencing a brief issue with one of our providers. Your funds and existing predictions are completely safe. We're actively working to resolve this — please check back shortly.")}
            </p>
          </div>
        ) : filteredFights.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            {activeTab === "picks"
              ? "No predictions placed yet"
              : searchQuery
                ? t("operator.noSearchResults", "No events match your search")
                : t("operator.noEvents")}
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
                themeColor={theme.primary}
                onShareWin={handleShareWin}
              />
            );
          })
        )}
      </div>

      {/* Fee disclosure */}
      <div className="max-w-4xl mx-auto px-4 pb-4">
        <p className="text-[10px] text-white/20 text-center">
          {t("operator.platformFee")}
        </p>
      </div>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-white/20">
        {t("operator.poweredBy")} <span style={{ color: theme.primary }}>1MG.live</span>
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
