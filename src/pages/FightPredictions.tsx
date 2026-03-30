import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Swords, TrendingUp, ChevronDown, ChevronUp, Loader2, Radio, Clock, Trophy, History, ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useAllowanceGate } from "@/hooks/useAllowanceGate";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { usePolymarketSession } from "@/hooks/usePolymarketSession";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";
import Navbar from "@/components/Navbar";
import EventSection, { parseSport } from "@/components/predictions/EventSection";
import predictionsHero from "@/assets/predictions-hero.jpeg";
import GeoBlockScreen from "@/components/predictions/GeoBlockScreen";
import PredictionModal from "@/components/predictions/PredictionModal";
import ComingSoonCard from "@/components/predictions/ComingSoonCard";
import AllowanceDebugPanel from "@/components/predictions/AllowanceDebugPanel";

import { WalletGateModal } from "@/components/WalletGateModal";
import ONEFridayFightsHub from "@/components/predictions/ONEFridayFightsHub";
import SocialShareModal from "@/components/SocialShareModal";
import { SOCIAL_SHARE_ENABLED } from "@/lib/socialShareConfig";
import { useMyReferralCode } from "@/hooks/useMyReferralCode";
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult } from "@/components/predictions/tradeResultTypes";
import { usePolymarketPrices } from "@/hooks/usePolymarketPrices";
import { PREDICTION_VISIBILITY_VALUES } from "@/lib/predictionVisibility";

const FEE_RATE = 0.05;

// DEPRECATED: Solana wallet addresses — will be removed when Polygon
// payment edge functions are implemented.
// const PREDICTION_FEE_WALLET = ...
// const PREDICTION_POOL_WALLET = ...

const ALL_SPORTS = ["ALL", "MUAY THAI", "BARE KNUCKLE", "MMA", "BOXING", "FUTBOL"];
const FEED_REFRESH_MIN_MS = 15_000;
const FIGHTS_SELECT = [
  "id",
  "title",
  "fighter_a_name",
  "fighter_b_name",
  "pool_a_lamports",
  "pool_b_lamports",
  "pool_a_usd",
  "pool_b_usd",
  "shares_a",
  "shares_b",
  "status",
  "winner",
  "resolved_at",
  "claims_open_at",
  "event_name",
  "event_id",
  "event_date",
  "method",
  "weight_class",
  "fight_class",
  "refund_status",
  "home_logo",
  "away_logo",
  "source",
  "commission_bps",
  "price_a",
  "price_b",
  "polymarket_question",
  "fighter_a_photo",
  "fighter_b_photo",
  "explainer_card",
  "stats_json",
  "featured",
  "fighter_a_record",
  "fighter_b_record",
  "venue",
  "referee",
  "polymarket_volume_usd",
  "has_updates",
].join(",");
const EVENTS_SELECT = [
  "id",
  "event_name",
  "organization",
  "event_date",
  "location",
  "status",
  "is_test",
  "source_provider",
  "league_logo",
  "category",
].join(",");

function sortByNullableDateAsc<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return [...items].sort((a, b) => {
    const aValue = getDate(a);
    const bValue = getDate(b);
    const aMs = aValue ? new Date(aValue).getTime() : Number.POSITIVE_INFINITY;
    const bMs = bValue ? new Date(bValue).getTime() : Number.POSITIVE_INFINITY;
    return aMs - bMs;
  });
}

interface PredictionEvent {
  id: string;
  event_name: string;
  organization: string | null;
  event_date: string | null;
  location: string | null;
  status: string;
  is_test: boolean;
  source_provider?: string | null;
  league_logo?: string | null;
  category?: string | null;
}

interface FeedEntry {
  id: string;
  wallet_short: string;
  fighter_pick: string;
  amount_lamports: number;
  amount_usd?: number;
  fight_id: string;
  created_at: string;
}

type StatusSection = "live" | "today" | "upcoming" | "past";

const STATUS_CONFIG: Record<StatusSection, { icon: React.ReactNode; label: string; className: string; dotClassName: string }> = {
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
  past: {
    icon: <Clock className="w-4 h-4" />,
    label: "AWAITING RESULTS",
    className: "text-amber-400",
    dotClassName: "bg-amber-400 animate-pulse",
  },
};

function StatusSectionHeader({ section, count }: { section: StatusSection; count: number }) {
  const config = STATUS_CONFIG[section];
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

function PastEventsSection({
  pastEvents,
  renderEventList,
  userEntries,
}: {
  pastEvents: [string, { event?: PredictionEvent; fights: Fight[] }][];
  renderEventList: (entries: [string, { event?: PredictionEvent; fights: Fight[] }][]) => React.ReactNode;
  userEntries: any[];
}) {
  const [expanded, setExpanded] = useState(false);

  // Keep events visible if:
  // 1. User has unclaimed winning entries in any fight, OR
  // 2. Fight resolved within last 48h
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const recentPast = pastEvents.filter(([, group]) =>
    group.fights.some(f => {
      // Always show if user has unclaimed wins
      const hasUnclaimedWin = f.winner && userEntries.some(
        (e: any) => e.fight_id === f.id && e.fighter_pick === f.winner && !e.claimed
      );
      if (hasUnclaimedWin) return true;

      const resolvedAt = f.resolved_at || f.claims_open_at;
      return resolvedAt ? new Date(resolvedAt).getTime() > cutoff : true;
    })
  );

  if (recentPast.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        className="w-full flex items-center justify-between bg-card border border-border/50 rounded-lg px-4 py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-foreground">Past Events</span>
          <span className="text-[10px] text-muted-foreground">({recentPast.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="bg-card/60 border border-border/30 rounded-lg px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">
              ✅ Winnings are <span className="font-bold text-foreground">automatically sent</span> to your wallet. No action needed.
            </p>
          </div>
          {renderEventList(recentPast)}
        </div>
      )}
    </div>
  );
}

export default function FightPredictions() {
  // Use Privy EVM wallet for predictions (Polygon)
  const { walletAddress: address, eoaAddress, isPrivyUser } = usePrivyWallet();
  const { authenticated, login, getAccessToken } = usePrivy();
  const { state: allowanceState, ensureAllowance, reset: resetAllowance } = useAllowanceGate();
  const { relayer_allowance } = usePolygonUSDC();
  const { hasSession, canTrade, loading: pmSessionLoading, setupTradingWallet } = usePolymarketSession();
  const referralCode = useMyReferralCode(address ?? null);
  const { t } = useTranslation();
  const [fights, setFights] = useState<Fight[]>([]);
  const [events, setEvents] = useState<PredictionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedUnavailable, setFeedUnavailable] = useState(false);
  const [backendDegraded, setBackendDegraded] = useState(false);
  const [showFeed, setShowFeed] = useState(true);
  const [userEntries, setUserEntries] = useState<any[]>([]);
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [selectedPick, setSelectedPick] = useState<"fighter_a" | "fighter_b" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [activeSport, setActiveSport] = useState("ALL");
  const [showWalletGate, setShowWalletGate] = useState(false);
  const [showPredictionSuccess, setShowPredictionSuccess] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<TradeResult | null>(null);
  const [claimShareData, setClaimShareData] = useState<{ eventTitle: string; amountWon: number; fighterName?: string; sport?: string } | null>(null);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [geoBlockDismissed, setGeoBlockDismissed] = useState(false);
  const fightsRequestInFlight = useRef(false);
  const queuedFightsReload = useRef(false);
  const feedRequestInFlight = useRef(false);
  const lastFeedLoadAt = useRef(0);
  const consecutiveFailures = useRef(0);
  const readOnly = geoBlocked && geoBlockDismissed;

  usePolymarketPrices(!backendDegraded);

  const isConnected = authenticated && isPrivyUser;

  const loadFights = useCallback(async () => {
    if (fightsRequestInFlight.current) {
      queuedFightsReload.current = true;
      return;
    }

    fightsRequestInFlight.current = true;

    try {
      const [fightsRes, eventsRes] = await Promise.all([
        supabase
          .from("prediction_fights")
          .select(FIGHTS_SELECT)
          .not("status", "eq", "draft")
          .in("visibility", PREDICTION_VISIBILITY_VALUES as unknown as string[])
          .is("operator_id", null)
          .not("status", "eq", "settled")
          .limit(200),
        supabase
          .from("prediction_events")
          .select(EVENTS_SELECT)
          .eq("status", "approved")
          .limit(100),
      ]);

      if (fightsRes.error) throw fightsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      if (fightsRes.data) {
        setFights(sortByNullableDateAsc((fightsRes.data ?? []) as unknown as any[], (fight: any) => fight.event_date) as any);
      }

      if (eventsRes.data) {
        setEvents(sortByNullableDateAsc((eventsRes.data ?? []) as unknown as PredictionEvent[], (event) => event.event_date));
      }

      setBackendDegraded(false);
      consecutiveFailures.current = 0;
    } catch (err) {
      console.error("[FightPredictions] loadFights failed:", err);
      setBackendDegraded(true);
      consecutiveFailures.current += 1;
    } finally {
      setLoading(false);
      fightsRequestInFlight.current = false;

      if (queuedFightsReload.current) {
        queuedFightsReload.current = false;
        void loadFights();
      }
    }
  }, []);

  const loadUserEntries = useCallback(async () => {
    if (!address) return;
    try {
      const { data } = await supabase.from("prediction_entries").select("*").eq("wallet", address);
      if (data) setUserEntries(data);
    } catch (err) {
      console.warn("[FightPredictions] loadUserEntries failed:", err);
    }
  }, [address]);

  const loadFeed = useCallback(async (force = false) => {
    const now = Date.now();

    if (!force && now - lastFeedLoadAt.current < FEED_REFRESH_MIN_MS) return;
    if (feedRequestInFlight.current) return;

    feedRequestInFlight.current = true;
    lastFeedLoadAt.current = now;

    try {
      const { data, error } = await supabase.functions.invoke("prediction-feed");
      if (error) throw error;

      if (Array.isArray(data?.feed)) {
        setFeed(data.feed);
      }

      setFeedUnavailable(Boolean(data?.degraded));
    } catch (err) {
      console.warn("[FightPredictions] loadFeed failed:", err);
      setFeed([]);
      setFeedUnavailable(true);
    } finally {
      feedRequestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void loadFights();
    void loadFeed(true);
  }, [loadFights, loadFeed]);

  useEffect(() => {
    void loadUserEntries();
  }, [loadUserEntries]);

  useEffect(() => {
    const channel = supabase
      .channel("prediction-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_fights" }, () => {
        void loadFights();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "prediction_entries" }, () => {
        void loadFeed(true);
        void loadFights();
        if (address) void loadUserEntries();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadFights, loadFeed, loadUserEntries, address]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Back off polling when backend is unhealthy
      const backoffMs = Math.min(15_000 * Math.pow(2, consecutiveFailures.current), 120_000);
      if (consecutiveFailures.current > 0 && Date.now() - lastFeedLoadAt.current < backoffMs) return;
      void loadFights();
    }, 15_000);
    return () => clearInterval(interval);
  }, [loadFights]);

  // Group fights by event
  const groupedEvents = useMemo(() => {
    const eventMap = new Map(events.map(e => [e.id, e]));
    const approvedEventIds = new Set(events.map(e => e.id));
    const groups: Record<string, { event?: PredictionEvent; fights: Fight[] }> = {};

    fights.forEach((f) => {
      if (f.event_id && !approvedEventIds.has(f.event_id)) return;

      let groupKey: string;
      let event: PredictionEvent | undefined;

      if (f.event_id && eventMap.has(f.event_id)) {
        event = eventMap.get(f.event_id);
        groupKey = event!.event_name;
      } else {
        const baseEvent = f.event_name.includes("Road to Tulum")
          ? f.event_name.replace(" — Road to Tulum", "")
          : f.event_name;
        groupKey = baseEvent;
      }

      if (!groups[groupKey]) groups[groupKey] = { event, fights: [] };
      groups[groupKey].fights.push(f);
    });
    return groups;
  }, [fights, events]);

  const activeSports = useMemo(() => {
    const sports = new Set(Object.entries(groupedEvents).map(([key, val]) => parseSport(key, val.event?.source_provider, val.event?.category)));
    return ALL_SPORTS.filter(s => s === "ALL" || sports.has(s) || ["MUAY THAI", "BOXING", "MMA", "BARE KNUCKLE", "FUTBOL"].includes(s));
  }, [groupedEvents]);

  // Filter by sport
  const filteredEvents = useMemo(() => {
    if (activeSport === "ALL") return groupedEvents;
    return Object.fromEntries(
      Object.entries(groupedEvents).filter(([key, val]) => parseSport(key, val.event?.source_provider, val.event?.category) === activeSport)
    );
  }, [groupedEvents, activeSport]);

  // Categorize events into status sections
  const { liveEvents, todayEvents, upcomingEvents, pastEvents, staleLiveKeys } = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = now.toDateString();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const live: [string, { event?: PredictionEvent; fights: Fight[] }][] = [];
    const today: [string, { event?: PredictionEvent; fights: Fight[] }][] = [];
    const upcoming: [string, { event?: PredictionEvent; fights: Fight[] }][] = [];
    const past: [string, { event?: PredictionEvent; fights: Fight[] }][] = [];
    const staleKeys = new Set<string>();

    for (const [eventName, group] of Object.entries(filteredEvents)) {
      const event = group.event;
      const eventDateStr = event?.event_date;
      const eventMs = eventDateStr ? new Date(eventDateStr).getTime() : null;

      const hasLiveFights = group.fights.some(f => f.status === "live");
      const hasOpenFights = group.fights.some(f => f.status === "open");
      const allSettledOrPast = group.fights.every(f =>
        ["settled", "confirmed", "result_selected", "draw", "refund_pending", "refunds_processing", "refunds_complete", "cancelled", "locked"].includes(f.status)
      );

      // Stale-live: started >6h ago OR on a previous calendar day
      const isStaleLive = eventMs != null && (
        (nowMs - eventMs) > 6 * 60 * 60 * 1000 ||
        new Date(eventMs).toDateString() !== todayStr
      );

      if (hasLiveFights && !isStaleLive) {
        live.push([eventName, group]);
      } else if (allSettledOrPast || (hasLiveFights && isStaleLive)) {
        past.push([eventName, group]);
        if (hasLiveFights && isStaleLive) staleKeys.add(eventName);
      } else if (eventMs && eventMs > tomorrowStart.getTime()) {
        upcoming.push([eventName, group]);
      } else if (eventMs && new Date(eventMs).toDateString() !== todayStr && eventMs < nowMs) {
        // Event date is on a previous calendar day → always past, even if fights are still "open"
        past.push([eventName, group]);
      } else if (hasOpenFights || (eventMs && new Date(eventMs).toDateString() === todayStr)) {
        today.push([eventName, group]);
      } else if (eventMs && eventMs < nowMs) {
        past.push([eventName, group]);
      } else {
        upcoming.push([eventName, group]);
      }
    }

    return { liveEvents: live, todayEvents: today, upcomingEvents: upcoming, pastEvents: past, staleLiveKeys: staleKeys };
  }, [filteredEvents, events]);

  const hotFightIds = useMemo(() => {
    const sorted = [...fights]
      .filter(f => f.status === "open")
      .sort((a, b) => {
        const poolA = ((a as any).pool_a_usd || a.pool_a_lamports / 1e9) + ((a as any).pool_b_usd || a.pool_b_lamports / 1e9);
        const poolB = ((b as any).pool_a_usd || b.pool_a_lamports / 1e9) + ((b as any).pool_b_usd || b.pool_b_lamports / 1e9);
        return poolB - poolA;
      });
    return new Set(sorted.slice(0, 3).filter(f => {
      const pool = ((f as any).pool_a_usd || f.pool_a_lamports / 1e9) + ((f as any).pool_b_usd || f.pool_b_lamports / 1e9);
      return pool > 0;
    }).map(f => f.id));
  }, [fights]);

  const comingSoonSports = useMemo(() => {
    const existingSports = new Set(Object.entries(groupedEvents).map(([key, val]) => parseSport(key, val.event?.source_provider, val.event?.category)));
    return ["MUAY THAI", "BOXING", "MMA", "BARE KNUCKLE", "FUTBOL"].filter(s => !existingSports.has(s));
  }, [groupedEvents]);


  // TODO [POLYMARKET]: Replace this entire function with Polygon/Polymarket
  // transaction execution. The new flow should:
  // 1. Build an EVM transaction (or Polymarket CLOB order)
  // 2. Send via server-side gas-sponsored execution (edge function)
  // 3. Verify on Polygon before recording in DB
  const handleSubmit = async (amountUsd: number) => {
    if (!selectedFight || !selectedPick || !isConnected || !address) return;
    setSubmitting(true);
    resetAllowance();
    dbg("predict:start", { fightId: selectedFight.id, pick: selectedPick, amountUsd, wallet: address });

    try {
      // Step 1: Get Privy access token
      dbg("predict:step1_token", {});
      let privyToken: string | null = null;
      try {
        privyToken = await getAccessToken();
      } catch (tokenErr) {
        console.error("[Predict] getAccessToken threw:", tokenErr);
      }
      if (!privyToken) {
        dbg("predict:token_null", {});
        toast.error("Session expired", {
          description: "Please log in again to place predictions.",
          action: { label: "Log in", onClick: () => login() },
        });
        setSubmitting(false);
        return;
      }

      // Step 2: Auth preflight
      dbg("predict:step2_preflight", {});
      let preflightPassed = false;
      for (let preflightAttempt = 0; preflightAttempt < 2; preflightAttempt++) {
        const { data: preflightData, error: preflightError } = await supabase.functions.invoke(
          "prediction-preflight",
          { headers: { "x-privy-token": privyToken } },
        );
        if (!preflightError && preflightData?.ok) {
          preflightPassed = true;
          break;
        }
        let detail = preflightData?.detail || preflightData?.error;
        if (!detail && preflightError) {
          try {
            const errBody = typeof preflightError === "object" && (preflightError as any).context
              ? await (preflightError as any).context.json()
              : null;
            detail = errBody?.detail || errBody?.error || preflightError.message;
          } catch {
            detail = preflightError.message;
          }
        }
        console.warn(`[Predict] Preflight attempt ${preflightAttempt + 1} failed:`, detail);

        const isTransient = typeof detail === "string" && (
          detail.includes("JWKS") || detail.includes("Expected 200 OK") ||
          detail.includes("jwt_verification_failed") || detail.includes("fetch") ||
          detail.includes("privy_api_")
        );

        if (!isTransient) {
          toast.error("Authentication failed", {
            description: "Please log in again to place predictions.",
            action: { label: "Log in", onClick: () => login() },
          });
          setSubmitting(false);
          return;
        }

        if (preflightAttempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (!preflightPassed) {
        console.warn("[Predict] Preflight failed twice — bypassing (submit has its own JWT check)");
        toast.info("Auth check slow — proceeding directly", { duration: 3000 });
      }

      // Step 3: STRICT ALLOWANCE GATE — blocks until on-chain confirmed
      const feeRate = selectedFight.commission_bps != null
        ? selectedFight.commission_bps / 10_000
        : (selectedFight.source === "polymarket" ? 0.02 : 0.05);
      const feeUsdc = amountUsd * feeRate;

      dbg("predict:step3_allowance", { feeUsdc, feeRate, relayer_allowance });

      if (feeUsdc > 0.01) {
        const approved = await ensureAllowance(feeUsdc);
        if (!approved) {
          dbg("predict:allowance_gate_failed", { step: allowanceState.step, error: allowanceState.errorReason });
          // Error is already shown via ApprovalStepIndicator in the UI
          setSubmitting(false);
          return;
        }
        dbg("predict:allowance_gate_passed", { step: allowanceState.step });
      }

      // Step 4: Submit prediction — backend handles fee collection via relayer
      dbg("predict:step4_submit", { fightId: selectedFight.id, amount: amountUsd });
      const { data, error } = await supabase.functions.invoke("prediction-submit", {
        body: {
          fight_id: selectedFight.id,
          wallet: address,
          wallet_eoa: eoaAddress ?? undefined,
          fighter_pick: selectedPick,
          amount_usd: amountUsd,
          chain: "polygon",
        },
        headers: { "x-privy-token": privyToken },
      });

      if (error || data?.error) {
        const backendMsg = data?.error || error?.message || "Backend error";
        const errorCode = data?.error_code || "";
        const isRelayerError = errorCode.startsWith("rpc_") || errorCode === "relayer_not_configured" || errorCode === "relayer_tx_failed" || errorCode === "fee_collection_failed";
        const isSetupRequired = errorCode === "trading_wallet_setup_required";
        dbg("predict:backend_error", { backendMsg, errorCode, isRelayerError, isSetupRequired });
        const isGeoBlocked = errorCode === "geo_blocked" || backendMsg.toLowerCase().includes("region") || backendMsg.toLowerCase().includes("restricted") || backendMsg.toLowerCase().includes("geo");
        if (isGeoBlocked) {
          setGeoBlocked(true);
          setSubmitting(false);
          return;
        }
        if (isSetupRequired) {
          toast.error("Trading wallet setup needed", {
            description: "Setting up your trading wallet. Please try again after setup completes.",
            duration: 6000,
          });
          setupTradingWallet().catch(() => {});
          setSubmitting(false);
          return;
        }
        if (isRelayerError) {
          throw new Error("fee_relay_failed:" + backendMsg);
        }
        throw new Error(backendMsg);
      }

      dbg("predict:success", { trade_order_id: data?.trade_order_id, status: data?.trade_status });

      setLastTradeResult({
        trade_order_id: data?.trade_order_id,
        trade_status: data?.trade_status,
        requested_amount_usdc: data?.requested_amount_usdc,
        fee_usdc: data?.fee_usdc,
        fee_bps: data?.fee_bps,
        net_amount_usdc: data?.net_amount_usdc,
        entry_id: data?.entry_id,
      });

      toast.success("Prediction submitted!", {
        description: `$${amountUsd.toFixed(2)} on ${selectedPick === "fighter_a" ? selectedFight.fighter_a_name : selectedFight.fighter_b_name}`,
      });
      setShowPredictionSuccess(true);
      loadFights();
      loadUserEntries();
    } catch (err: any) {
      console.error("Prediction failed:", err);
      const msg: string = err.message || "Unknown error";
      dbg("predict:error", { message: msg });

      const isAuthError =
        msg.includes("token_expired") ||
        msg.includes("auth_failed") ||
        msg.includes("auth_required") ||
        msg.includes("privy_api");
      const isApprovalError = msg.includes("approval") || msg.includes("allowance");
      const isRelayerError = msg.startsWith("fee_relay_failed:");

      if (isAuthError) {
        toast.error("Session expired", {
          description: "Please log in again to place predictions.",
          action: { label: "Log in", onClick: () => login() },
        });
      } else if (isRelayerError) {
        toast.error("Network issue — try again", {
          description: "Your approval is fine. The payment network was temporarily unavailable. Please retry.",
          duration: 6000,
        });
      } else if (isApprovalError) {
        toast.error("USDC approval failed", {
          description: "The approval transaction was not completed. Please try again.",
        });
      } else {
        toast.error("Prediction failed", { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (fightId: string) => {
    if (!address) return;
    const f = fights.find(fi => fi.id === fightId);
    const userPick = userEntries.find(e => e.fight_id === fightId);
    setClaiming(true);
    try {
      // TODO [POLYMARKET]: Update claim to use Polygon payout
      const { data, error } = await supabase.functions.invoke("prediction-claim", {
        body: { fight_id: fightId, wallet: address, chain: "polygon" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const amountWon = data.reward_usd || data.reward_sol || 0;
      const txInfo = data.payout_tx ? ` (tx: ${String(data.payout_tx).slice(0, 10)}…)` : "";
      toast.success("Reward claimed!", { description: `$${amountWon.toFixed(2)} sent to your wallet${txInfo}` });
      await loadUserEntries();
      if (SOCIAL_SHARE_ENABLED) {
        const pickedName = userPick
          ? (userPick.fighter_pick === "fighter_a" ? f?.fighter_a_name : f?.fighter_b_name)
          : undefined;
        setClaimShareData({
          eventTitle: f?.title || f?.event_name || "Prediction Win",
          amountWon,
          fighterName: pickedName || undefined,
          sport: f?.event_name,
        });
      }
    } catch (err: any) {
      toast.error("Claim failed", { description: err.message });
    } finally {
      setClaiming(false);
    }
  };

  const getFighterName = (fightId: string, pick: string) => {
    const f = fights.find((f) => f.id === fightId);
    if (!f) return pick;
    return pick === "fighter_a" ? f.fighter_a_name : f.fighter_b_name;
  };

  const handlePredict = (fight: Fight, pick: "fighter_a" | "fighter_b") => {
    console.log("[Predict] handlePredict called", { fightId: fight.id, status: fight.status, pick });
    if (fight.status !== "open") {
      toast.error("Predictions closed", {
        description: "This market is locked — predictions are no longer accepted.",
      });
      return;
    }
    if (!isConnected) {
      // Trigger Privy login if not authenticated
      if (!authenticated) {
        login();
      } else {
        setShowWalletGate(true);
      }
      return;
    }
    setSelectedFight(fight);
    setSelectedPick(pick);
  };

  const hasContent = liveEvents.length > 0 || todayEvents.length > 0 || upcomingEvents.length > 0 || pastEvents.length > 0;

  const renderEventList = (entries: [string, { event?: PredictionEvent; fights: Fight[] }][]) =>
    entries.map(([eventName, group]) => (
      <EventSection
        key={eventName}
        eventName={eventName}
        fights={group.fights}
        wallet={address}
        userEntries={userEntries}
        onPredict={handlePredict}
        onClaim={handleClaim}
        claiming={claiming}
        hotFightIds={hotFightIds}
        onWalletRequired={() => {
          if (!authenticated) login();
          else setShowWalletGate(true);
        }}
        event={group.event}
        isStaleLive={staleLiveKeys.has(eventName)}
        readOnly={readOnly}
      />
    ));

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="relative h-56 sm:h-72 md:h-96 w-full">
          <img
            src={predictionsHero}
            alt="Muay Thai fighters in the ring"
            className="w-full h-full object-cover object-[center_24%]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 pb-2 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-3 backdrop-blur-sm">
              <Swords className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">{t("predictions.badge")}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground font-['Cinzel'] mb-2">
              {t("predictions.title")}
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              {t("predictions.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Sport Filter Chips */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {activeSports.map((sport) => {
            const isActive = activeSport === sport;
            const hasEvents = sport === "ALL" || Object.entries(groupedEvents).some(([e, val]) => parseSport(e, val.event?.source_provider, val.event?.category) === sport);
            return (
              <button
                key={sport}
                onClick={() => setActiveSport(sport)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : hasEvents
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {sport}
                {!hasEvents && sport !== "ALL" && <span className="ml-1 text-[8px] opacity-60">SOON</span>}
              </button>
            );
          })}
        </div>
      </div>


      {/* Content — organized by status sections */}
      <div className="max-w-4xl mx-auto px-4 pb-8 space-y-6">
        {/* Geo-block banner */}
        {geoBlocked && !geoBlockDismissed && (
          <GeoBlockScreen
            wallet={address || undefined}
            onDismiss={() => setGeoBlockDismissed(true)}
            onExploreReadOnly={() => setGeoBlockDismissed(true)}
          />
        )}
        {activeSport === "MUAY THAI" && (
          <ONEFridayFightsHub hasFights={hasContent} />
        )}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : backendDegraded && !hasContent ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-6 py-12 text-center">
            <ShieldCheck className="w-14 h-14 mx-auto mb-4 text-amber-400" />
            <h3 className="text-lg font-bold text-foreground">All Predictions Are Temporarily On Hold</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              We're experiencing a brief issue with one of our providers. Your funds and existing predictions are completely safe. We're actively working to resolve this — please check back shortly.
            </p>
            <button
              onClick={() => {
                setLoading(true);
                void loadFights();
                void loadFeed(true);
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
            >
              Retry Connection
            </button>
          </div>
        ) : !hasContent && activeSport !== "MUAY THAI" ? (
          <div className="text-center py-12 text-muted-foreground">
            <Swords className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>{activeSport !== "ALL" ? `No ${activeSport} events yet. Stay tuned!` : "No events available."}</p>
          </div>
        ) : (
          <>
            {backendDegraded && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 flex items-center gap-3 mb-4">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-200/80">
                  Some data may be delayed — we're resolving an issue with our providers. Your funds are safe.
                </p>
              </div>
            )}
            {/* LIVE NOW */}
            {liveEvents.length > 0 && (
              <div>
                <StatusSectionHeader section="live" count={liveEvents.length} />
                <div className="space-y-3">
                  {renderEventList(liveEvents)}
                </div>
              </div>
            )}

            {/* TODAY */}
            {todayEvents.length > 0 && (
              <div>
                <StatusSectionHeader section="today" count={todayEvents.length} />
                <div className="space-y-3">
                  {renderEventList(todayEvents)}
                </div>
              </div>
            )}

            {/* UPCOMING */}
            {upcomingEvents.length > 0 && (
              <div>
                <StatusSectionHeader section="upcoming" count={upcomingEvents.length} />
                <div className="space-y-3">
                  {renderEventList(upcomingEvents)}
                </div>
              </div>
            )}

            {/* PAST EVENTS — collapsible, 48h window */}
            {pastEvents.length > 0 && (
              <PastEventsSection
                pastEvents={pastEvents}
                renderEventList={renderEventList}
                userEntries={userEntries}
              />
            )}

            {/* Coming Soon cards */}
            {(activeSport === "ALL" || !Object.entries(groupedEvents).some(([key, val]) => parseSport(key, val.event?.source_provider, val.event?.category) === activeSport)) &&
              comingSoonSports.map((sport) => <ComingSoonCard key={sport} sport={sport} />)}
          </>
        )}

        {/* Live Activity Feed */}
        <div>
          <button
            className="w-full flex items-center justify-between bg-card border border-border/50 rounded-lg px-4 py-3"
            onClick={() => setShowFeed(!showFeed)}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">Live Predictions</span>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
            {showFeed ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showFeed && (
            <div className="mt-2 bg-card border border-border/50 rounded-lg divide-y divide-border/20 max-h-64 overflow-y-auto">
              {feed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {feedUnavailable ? "Live feed temporarily unavailable." : "No predictions yet. Be the first!"}
                </p>
              ) : (
                feed.map((entry) => (
                  <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground">{entry.wallet_short}</span>
                      <span className="text-xs text-muted-foreground">predicted</span>
                      <span className="text-xs font-bold text-foreground truncate">
                        {getFighterName(entry.fight_id, entry.fighter_pick)}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-primary whitespace-nowrap ml-2">
                      ${(entry.amount_usd ?? entry.amount_lamports / 1_000_000_000).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User's predictions */}
        {address && userEntries.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-foreground font-['Cinzel'] mb-3">Your Predictions</h2>
            <div className="bg-card border border-border/50 rounded-lg divide-y divide-border/20">
              {userEntries.map((entry) => {
                const f = fights.find((f) => f.id === entry.fight_id);
                return (
                  <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {getFighterName(entry.fight_id, entry.fighter_pick)}
                      </p>
                      <p className="text-xs text-muted-foreground">{f?.title || ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">${(entry.amount_usd ?? entry.amount_lamports / 1_000_000_000).toFixed(2)}</p>
                      {entry.claimed && entry.tx_signature && <p className="text-xs text-green-400">✅ Paid</p>}
                      {entry.claimed && !entry.tx_signature && <p className="text-xs text-green-400">✓ Claimed</p>}
                      {!entry.claimed && f?.winner === entry.fighter_pick && ["confirmed", "settled"].includes(f?.status || "") && (
                        <p className="text-xs text-primary animate-pulse">⏳ Payout processing...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedFight && selectedPick && (
        <PredictionModal
          fight={selectedFight}
          pick={selectedPick}
          onClose={() => { setSelectedFight(null); setSelectedPick(null); setShowPredictionSuccess(false); setLastTradeResult(null); resetAllowance(); }}
          onSubmit={handleSubmit}
          submitting={submitting}
          showSuccess={showPredictionSuccess}
          wallet={address || undefined}
          tradeResult={lastTradeResult}
          approvalStep={allowanceState.step}
          approvalError={allowanceState.errorReason}
        />
      )}

      <AllowanceDebugPanel />

      <WalletGateModal
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Sign In to Predict"
        description="Create an account to place predictions and earn rewards."
      />

      {SOCIAL_SHARE_ENABLED && claimShareData && (
        <SocialShareModal
          open={!!claimShareData}
          onClose={() => setClaimShareData(null)}
          variant="claim_win"
          eventTitle={claimShareData.eventTitle}
          gameTitle={claimShareData.fighterName}
          amountWon={claimShareData.amountWon}
          wallet={address || undefined}
          referralCode={referralCode ?? undefined}
          sport={claimShareData.sport}
        />
      )}
    </div>
  );
}
