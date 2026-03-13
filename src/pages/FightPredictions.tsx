import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Swords, TrendingUp, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import Navbar from "@/components/Navbar";
import EventSection, { parseSport } from "@/components/predictions/EventSection";
import predictionsHero from "@/assets/predictions-hero.jpeg";
import PredictionModal from "@/components/predictions/PredictionModal";
import ComingSoonCard from "@/components/predictions/ComingSoonCard";
import { WalletGateModal } from "@/components/WalletGateModal";
import type { Fight } from "@/components/predictions/FightCard";

const LAMPORTS = 1_000_000_000;
const FEE_RATE = 0.05;

const ALL_SPORTS = ["ALL", "MUAY THAI", "BOXING", "MMA", "FUTBOL"];

interface PredictionEvent {
  id: string;
  event_name: string;
  organization: string | null;
  event_date: string | null;
  location: string | null;
  status: string;
  is_test: boolean;
}

interface FeedEntry {
  id: string;
  wallet_short: string;
  fighter_pick: string;
  amount_lamports: number;
  fight_id: string;
  created_at: string;
}

export default function FightPredictions() {
  const { address, publicKey, isConnected, sendTransaction, connection } = useWallet();
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

  const loadFights = useCallback(async () => {
    const [fightsRes, eventsRes] = await Promise.all([
      supabase.from("prediction_fights").select("*").order("created_at", { ascending: true }),
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

  // Group fights by event. If fight has event_id, use event name. Else fall back to event_name field.
  const groupedEvents = useMemo(() => {
    const eventMap = new Map(events.map(e => [e.id, e]));
    const groups: Record<string, { event?: PredictionEvent; fights: Fight[] }> = {};

    fights.forEach((f) => {
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
    const sports = new Set(Object.keys(groupedEvents).map(e => parseSport(e)));
    return ALL_SPORTS.filter(s => s === "ALL" || sports.has(s) || ["BOXING", "MMA", "FUTBOL"].includes(s));
  }, [groupedEvents]);

  const filteredEvents = useMemo(() => {
    if (activeSport === "ALL") return groupedEvents;
    return Object.fromEntries(
      Object.entries(groupedEvents).filter(([key]) => parseSport(key) === activeSport)
    );
  }, [groupedEvents, activeSport]);

  const hotFightIds = useMemo(() => {
    const sorted = [...fights]
      .filter(f => f.status === "open")
      .sort((a, b) => (b.pool_a_lamports + b.pool_b_lamports) - (a.pool_a_lamports + a.pool_b_lamports));
    return new Set(sorted.slice(0, 3).filter(f => (f.pool_a_lamports + f.pool_b_lamports) > 0).map(f => f.id));
  }, [fights]);

  const comingSoonSports = useMemo(() => {
    const existingSports = new Set(Object.keys(groupedEvents).map(e => parseSport(e)));
    return ["BOXING", "MMA", "FUTBOL"].filter(s => !existingSports.has(s));
  }, [groupedEvents]);

  const handleSubmit = async (amountSol: number) => {
    if (!selectedFight || !selectedPick || !publicKey || !isConnected) return;
    setSubmitting(true);
    try {
      const amountLamports = Math.round(amountSol * LAMPORTS);
      const vaultWallet = new PublicKey("11111111111111111111111111111111");
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: vaultWallet, lamports: amountLamports })
      );
      const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const conn = new Connection(rpcUrl, "confirmed");
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const signature = await sendTransaction(tx, conn);
      await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      const { data, error } = await supabase.functions.invoke("prediction-submit", {
        body: {
          fight_id: selectedFight.id, wallet: address, fighter_pick: selectedPick,
          amount_lamports: amountLamports, tx_signature: signature,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Prediction submitted!", {
        description: `${amountSol} SOL on ${selectedPick === "fighter_a" ? selectedFight.fighter_a_name : selectedFight.fighter_b_name}`,
      });
      setShowPredictionSuccess(true);
      loadFights();
      loadUserEntries();
    } catch (err: any) {
      console.error("Prediction failed:", err);
      toast.error("Prediction failed", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (fightId: string) => {
    if (!address) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-claim", {
        body: { fight_id: fightId, wallet: address },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Reward claimed!", { description: `${data.reward_sol?.toFixed(4)} SOL sent` });
      loadUserEntries();
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
    if (!isConnected) { setShowWalletGate(true); return; }
    setSelectedFight(fight);
    setSelectedPick(pick);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Hero Image */}
        <div className="relative h-48 sm:h-64 md:h-80 w-full">
          <img
            src={predictionsHero}
            alt="Muay Thai fighters in the ring"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 pb-6 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-3 backdrop-blur-sm">
              <Swords className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">Prediction Markets</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground font-['Cinzel'] mb-2">
              Fight Predictions
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              Pick your fighter. Earn rewards. All predictions are final.
            </p>
          </div>
        </div>
      </div>

      {/* Sport Tabs */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {activeSports.map((sport) => {
            const isActive = activeSport === sport;
            const hasEvents = sport === "ALL" || Object.keys(groupedEvents).some(e => parseSport(e) === sport);
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

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pb-8 space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : Object.keys(filteredEvents).length === 0 && activeSport !== "ALL" ? (
          <div className="text-center py-12 text-muted-foreground">
            <Swords className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No {activeSport} events yet. Stay tuned!</p>
          </div>
        ) : (
          <>
            {Object.entries(filteredEvents).map(([eventName, group]) => (
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
                onWalletRequired={() => setShowWalletGate(true)}
                event={group.event}
              />
            ))}
            {(activeSport === "ALL" || !Object.keys(groupedEvents).some(e => parseSport(e) === activeSport)) &&
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
                      {(entry.amount_lamports / LAMPORTS).toFixed(2)} SOL
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
                      <p className="text-sm font-bold text-primary">{(entry.amount_lamports / LAMPORTS).toFixed(2)} SOL</p>
                      {entry.claimed && <p className="text-xs text-green-400">✓ Claimed</p>}
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
          onClose={() => { setSelectedFight(null); setSelectedPick(null); setShowPredictionSuccess(false); }}
          onSubmit={handleSubmit}
          submitting={submitting}
          showSuccess={showPredictionSuccess}
        />
      )}

      <WalletGateModal
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Connect to Predict"
        description="You need a wallet to place predictions and earn rewards."
      />
    </div>
  );
}
