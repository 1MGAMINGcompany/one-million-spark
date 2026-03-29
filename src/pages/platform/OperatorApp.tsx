import { useState, useEffect, useCallback, useMemo } from "react";
import { useOperatorBySubdomain, useOperatorSettings } from "@/hooks/useOperator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useAllowanceGate } from "@/hooks/useAllowanceGate";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { usePolymarketSession } from "@/hooks/usePolymarketSession";
import { usePolymarketPrices } from "@/hooks/usePolymarketPrices";
import { Globe, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";
import { Button } from "@/components/ui/button";
import EventSection, { parseSport } from "@/components/predictions/EventSection";
import PredictionModal from "@/components/predictions/PredictionModal";
import { WalletGateModal } from "@/components/WalletGateModal";
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult } from "@/components/predictions/tradeResultTypes";
import { isPropMarket } from "@/lib/detectSport";
import { getTeamLogo } from "@/lib/teamLogos";

const THEME_MAP: Record<string, { primary: string; bg: string; card: string }> = {
  blue: { primary: "#3b82f6", bg: "#06080f", card: "rgba(255,255,255,0.03)" },
  gold: { primary: "#d4a017", bg: "#0a0a0a", card: "rgba(255,255,255,0.03)" },
  red: { primary: "#ef4444", bg: "#0a0a0f", card: "rgba(255,255,255,0.03)" },
};

interface OperatorAppProps {
  subdomain: string;
}

export default function OperatorApp({ subdomain }: OperatorAppProps) {
  const { data: operator, isLoading } = useOperatorBySubdomain(subdomain);
  const { data: settings } = useOperatorSettings(operator?.id ?? null);

  const { authenticated, login, getAccessToken } = usePrivy();
  const { walletAddress: address, eoaAddress, isPrivyUser } = usePrivyWallet();
  const { state: allowanceState, ensureAllowance, reset: resetAllowance } = useAllowanceGate();
  const { relayer_allowance } = usePolygonUSDC();
  const { hasSession, canTrade, setupTradingWallet } = usePolymarketSession();
  usePolymarketPrices();

  const isConnected = authenticated && isPrivyUser;

  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [selectedPick, setSelectedPick] = useState<"fighter_a" | "fighter_b" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<TradeResult | null>(null);
  const [showWalletGate, setShowWalletGate] = useState(false);
  const [userEntries, setUserEntries] = useState<any[]>([]);
  const [claiming, setClaiming] = useState(false);

  // Operator's own fights (via operator_id on prediction_fights)
  const { data: operatorFights } = useQuery({
    queryKey: ["operator_fights", operator?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("prediction_fights")
        .select("*")
        .eq("operator_id", operator!.id)
        .not("status", "eq", "draft")
        .order("created_at", { ascending: true });
      return (data || []) as Fight[];
    },
    enabled: !!operator?.id,
    refetchInterval: 15000,
  });

  // Platform shared fights
  const allowedSports = settings?.allowed_sports || [];
  const { data: platformFights } = useQuery({
    queryKey: ["platform_fights_operator", settings?.show_platform_events],
    queryFn: async () => {
      const { data } = await supabase
        .from("prediction_fights")
        .select("*")
        .is("operator_id", null)
        .not("status", "eq", "draft")
        .order("created_at", { ascending: true })
        .limit(100);
      return (data || []) as Fight[];
    },
    enabled: settings?.show_platform_events !== false,
    refetchInterval: 15000,
  });

  // Load user entries
  const loadUserEntries = useCallback(async () => {
    if (!address) return;
    const { data } = await supabase.from("prediction_entries").select("*").eq("wallet", address);
    if (data) setUserEntries(data);
  }, [address]);

  useEffect(() => { loadUserEntries(); }, [loadUserEntries]);

  // Combine and filter fights
  const allFights = useMemo(() => {
    const opFights = (operatorFights || []).filter(f => !isPropMarket(f));
    const platFights = (platformFights || []).filter(f => {
      if (isPropMarket(f)) return false;
      // Filter by allowed sports
      if (allowedSports.length > 0) {
        const sport = parseSport(f.event_name, null, null);
        // Allow through if sport matches or if ALL is implied
        const sportLower = sport.toLowerCase();
        const allowed = allowedSports.some(s => s.toLowerCase() === sportLower || sportLower.includes(s.toLowerCase()));
        if (!allowed && allowedSports.length > 0) return false;
      }
      return true;
    });
    return [...opFights, ...platFights];
  }, [operatorFights, platformFights, allowedSports]);

  // Group fights by event
  const groupedEvents = useMemo(() => {
    const groups: Record<string, { fights: Fight[] }> = {};
    allFights.forEach(f => {
      const key = f.event_name || "Events";
      if (!groups[key]) groups[key] = { fights: [] };
      groups[key].fights.push(f);
    });
    return groups;
  }, [allFights]);

  const hotFightIds = useMemo(() => new Set<string>(), []);

  // ── Prediction submission (reuses same engine as FightPredictions) ──
  const handleSubmit = async (amountUsd: number) => {
    if (!selectedFight || !selectedPick || !isConnected || !address) return;
    setSubmitting(true);
    resetAllowance();

    try {
      const privyToken = await getAccessToken();
      if (!privyToken) {
        toast.error("Session expired", { description: "Please log in again." });
        setSubmitting(false);
        return;
      }

      // Allowance gate
      const feeRate = selectedFight.commission_bps != null
        ? selectedFight.commission_bps / 10_000
        : (selectedFight.source === "polymarket" ? 0.02 : 0.05);
      const feeUsdc = amountUsd * feeRate;
      if (feeUsdc > 0.01) {
        const approved = await ensureAllowance(feeUsdc);
        if (!approved) { setSubmitting(false); return; }
      }

      // Submit with operator context
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
          toast.error("Trading wallet setup needed");
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

      toast.success("Prediction submitted!", {
        description: `$${amountUsd.toFixed(2)} placed successfully`,
      });
      setShowSuccess(true);
      loadUserEntries();
    } catch (err: any) {
      toast.error("Prediction failed", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePredict = (fight: Fight, pick: "fighter_a" | "fighter_b") => {
    if (fight.status !== "open") {
      toast.error("Predictions closed");
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
      toast.success("Reward claimed!", { description: `$${(data.reward_usd || 0).toFixed(2)} sent` });
      loadUserEntries();
    } catch (err: any) {
      toast.error("Claim failed", { description: err.message });
    } finally {
      setClaiming(false);
    }
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
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Not Found</h2>
          <p className="text-white/50">This app doesn't exist yet.</p>
        </div>
      </div>
    );
  }

  const theme = THEME_MAP[operator.theme] || THEME_MAP.blue;
  const eventEntries = Object.entries(groupedEvents);

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
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Events */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {allFights.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            No events available yet. Check back soon!
          </div>
        ) : (
          eventEntries.map(([eventName, group]) => (
            <EventSection
              key={eventName}
              eventName={eventName}
              fights={group.fights}
              wallet={address || null}
              userEntries={userEntries}
              onPredict={handlePredict}
              onClaim={handleClaim}
              claiming={claiming}
              hotFightIds={hotFightIds}
              onWalletRequired={() => { if (!authenticated) login(); else setShowWalletGate(true); }}
            />
          ))
        )}
      </div>

      {/* Fee disclosure */}
      <div className="max-w-4xl mx-auto px-4 pb-4">
        <p className="text-[10px] text-white/20 text-center">
          1MG platform fee: 1%. For some events, additional market fees may apply where required.
        </p>
      </div>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-white/20">
        Powered by <span style={{ color: theme.primary }}>1MG.live</span>
      </footer>

      {/* Prediction Modal */}
      {selectedFight && selectedPick && (
        <PredictionModal
          fight={selectedFight}
          pick={selectedPick}
          onClose={() => { setSelectedFight(null); setSelectedPick(null); setShowSuccess(false); setLastTradeResult(null); resetAllowance(); }}
          onSubmit={handleSubmit}
          submitting={submitting}
          showSuccess={showSuccess}
          wallet={address || undefined}
          tradeResult={lastTradeResult}
          approvalStep={allowanceState.step}
          approvalError={allowanceState.errorReason}
        />
      )}

      <WalletGateModal
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Sign In to Predict"
        description="Create an account to place predictions and earn rewards."
      />
    </div>
  );
}
