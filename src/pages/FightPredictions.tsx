import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Swords, TrendingUp, ChevronDown, ChevronUp, Loader2, Radio, Clock, Trophy, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { usePrivyFeeTransfer } from "@/hooks/usePrivyFeeTransfer";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { usePolymarketSession } from "@/hooks/usePolymarketSession";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import EventSection, { parseSport } from "@/components/predictions/EventSection";
import predictionsHero from "@/assets/predictions-hero.jpeg";
import PredictionModal from "@/components/predictions/PredictionModal";
import ComingSoonCard from "@/components/predictions/ComingSoonCard";

import { WalletGateModal } from "@/components/WalletGateModal";
import ONEFridayFightsHub from "@/components/predictions/ONEFridayFightsHub";
import SocialShareModal from "@/components/SocialShareModal";
import { SOCIAL_SHARE_ENABLED } from "@/lib/socialShareConfig";
import { useMyReferralCode } from "@/hooks/useMyReferralCode";
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult } from "@/components/predictions/tradeResultTypes";
import { usePolymarketPrices } from "@/hooks/usePolymarketPrices";

const FEE_RATE = 0.05;

// DEPRECATED: Solana wallet addresses — will be removed when Polygon
// payment edge functions are implemented.
// const PREDICTION_FEE_WALLET = ...
// const PREDICTION_POOL_WALLET = ...

const ALL_SPORTS = ["ALL", "MUAY THAI", "BARE KNUCKLE", "MMA", "BOXING", "FUTBOL"];

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
  const { walletAddress: address, isPrivyUser } = usePrivyWallet();
  const { authenticated, login, getAccessToken } = usePrivy();
  const { approveFeeAllowance } = usePrivyFeeTransfer();
  const { relayer_allowance } = usePolygonUSDC();
  usePolymarketSession(); // kept for hook stability
  usePolymarketPrices(); // live price + volume refresh (45s cycle)
  const referralCode = useMyReferralCode(address ?? null);
  const { t } = useTranslation();
  const [fights, setFights] = useState<Fight[]>([]);
  const [events, setEvents] = useState<PredictionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
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

  const isConnected = authenticated && isPrivyUser;

  const loadFights = useCallback(async () => {
    const [fightsRes, eventsRes] = await Promise.all([
      supabase.from("prediction_fights").select("*").not("status", "eq", "draft").order("created_at", { ascending: true }),
      supabase.from("prediction_events").select("*").eq("status", "approved").order("event_date", { ascending: true }),
    ]);
    if (fightsRes.data) setFights(fightsRes.data as any);
    if (eventsRes.data) setEvents(eventsRes.data as any);
    setLoading(false);
  }, []);

  const loadUserEntries = useCallback(async () => {
    if (!address) return;
    const { data } = await supabase.from("prediction_entries").select("*").eq("wallet", address);
    if (data) setUserEntries(data);
  }, [address]);

  const loadFeed = useCallback(async () => {
    const { data } = await supabase.functions.invoke("prediction-feed");
    if (data?.feed) setFeed(data.feed);
  }, []);

  useEffect(() => { loadFights(); loadFeed(); }, [loadFights, loadFeed]);
  useEffect(() => { loadUserEntries(); }, [loadUserEntries]);

  useEffect(() => {
    const channel = supabase
      .channel("prediction-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_fights" }, () => loadFights())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "prediction_entries" }, () => {
        loadFeed(); loadFights(); if (address) loadUserEntries();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadFights, loadFeed, loadUserEntries, address]);

  useEffect(() => {
    const interval = setInterval(() => { loadFights(); }, 15_000);
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
      } else if (eventMs && (nowMs - eventMs) > 24 * 60 * 60 * 1000 && new Date(eventMs).toDateString() !== todayStr) {
        // Event date is >24h in the past and not today's calendar day → past regardless of open fights
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
    console.log("[Predict] handleSubmit start", { fightId: selectedFight.id, pick: selectedPick, amountUsd, wallet: address });
    try {
      // Polymarket credentials are now handled server-side (shared backend keys)
      // No SIWE signing required from users

      // Step 1: Get Privy access token FIRST (before any money moves)
      console.log("[Predict] Step 1: Getting Privy access token...");
      let privyToken: string | null = null;
      try {
        privyToken = await getAccessToken();
      } catch (tokenErr) {
        console.error("[Predict] getAccessToken threw:", tokenErr);
      }
      if (!privyToken) {
        console.error("[Predict] Token is null — session likely expired");
        toast.error("Session expired", {
          description: "Please log in again to place predictions.",
          action: { label: "Log in", onClick: () => login() },
        });
        setSubmitting(false);
        return;
      }
      console.log("[Predict] Step 1 complete — token obtained");

      // Step 2: Auth preflight — verify JWKS/JWT are working before fee transfer
      // Preflight is a safety gate only; prediction-submit also verifies JWT independently.
      // If preflight fails twice (transient JWKS), we skip it and let submit handle auth.
      console.log("[Predict] Step 2: Running preflight...");
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
        // Extract error detail for logging
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
          // Non-transient auth error (e.g. expired token) — don't retry or bypass
          toast.error("Authentication failed", {
            description: "Please log in again to place predictions.",
            action: { label: "Log in", onClick: () => login() },
          });
          setSubmitting(false);
          return;
        }

        if (preflightAttempt === 0) {
          // Wait briefly before second attempt
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (!preflightPassed) {
        console.warn("[Predict] Preflight failed twice — bypassing (submit has its own JWT check)");
        toast.info("Auth check slow — proceeding directly", { duration: 3000 });
      } else {
        console.log("[Predict] Step 2 complete — preflight OK");
      }

      console.log("[Predict] Step 3: Checking allowance...", { feeUsdc: amountUsd * (selectedFight.commission_bps != null ? selectedFight.commission_bps / 10_000 : 0.05), allowance: relayer_allowance });
      const feeRate = selectedFight.commission_bps != null
        ? selectedFight.commission_bps / 10_000
        : (selectedFight.source === "polymarket" ? 0.02 : 0.05);
      const feeUsdc = amountUsd * feeRate;

      if (feeUsdc > 0.01) {
        const currentAllowance = relayer_allowance ?? 0;
        if (currentAllowance < feeUsdc) {
          // One-time approval — this is the ONLY wallet modal the user ever sees
          toast.info("One-time USDC approval", {
            description: "You're approving a spending limit — you won't be charged now. Future predictions skip this step.",
            duration: 6000,
          });
          const approveResult = await approveFeeAllowance();
          if (!approveResult.success) {
            throw new Error(approveResult.error || "USDC approval failed");
          }
          console.log("[Predict] Approval succeeded, waiting for on-chain propagation...");
          // Wait for allowance to propagate on-chain
          await new Promise((r) => setTimeout(r, 4000));
        }
      }

      console.log("[Predict] Step 4: Submitting to backend...");
      // Step 4: Submit prediction — backend handles fee collection via relayer
      const { data, error } = await supabase.functions.invoke("prediction-submit", {
        body: {
          fight_id: selectedFight.id,
          wallet: address,
          fighter_pick: selectedPick,
          amount_usd: amountUsd,
          chain: "polygon",
        },
        headers: { "x-privy-token": privyToken },
      });

      if (error || data?.error) {
        const backendMsg = data?.error || error?.message || "Backend error";
        const errorCode = data?.error_code || "";
        // Distinguish relayer/RPC failures from exchange failures
        const isRelayerError = errorCode.startsWith("rpc_") || errorCode === "relayer_not_configured" || errorCode === "relayer_tx_failed" || errorCode === "fee_collection_failed";
        if (isRelayerError) {
          throw new Error("fee_relay_failed:" + backendMsg);
        }
        throw new Error(backendMsg);
      }

      // Capture backend result for the success screen
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
        {activeSport === "MUAY THAI" && (
          <ONEFridayFightsHub hasFights={hasContent} />
        )}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !hasContent && activeSport !== "MUAY THAI" ? (
          <div className="text-center py-12 text-muted-foreground">
            <Swords className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>{activeSport !== "ALL" ? `No ${activeSport} events yet. Stay tuned!` : "No events available."}</p>
          </div>
        ) : (
          <>
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
                <p className="text-sm text-muted-foreground text-center py-4">No predictions yet. Be the first!</p>
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
          onClose={() => { setSelectedFight(null); setSelectedPick(null); setShowPredictionSuccess(false); setLastTradeResult(null); }}
          onSubmit={handleSubmit}
          submitting={submitting}
          showSuccess={showPredictionSuccess}
          wallet={address || undefined}
          tradeResult={lastTradeResult}
        />
      )}

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
