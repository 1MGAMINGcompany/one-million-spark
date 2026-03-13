import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Swords, TrendingUp, Trophy, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import Navbar from "@/components/Navbar";

const LAMPORTS = 1_000_000_000;
const MIN_SOL = 0.05;
const FEE_RATE = 0.05;

// Treasury wallet for fees — the vault/pool wallet is managed server-side
const TREASURY_WALLET = ""; // Will be set by admin; for now predictions go through edge function

interface Fight {
  id: string;
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  pool_a_lamports: number;
  pool_b_lamports: number;
  shares_a: number;
  shares_b: number;
  status: string;
  winner: string | null;
  resolved_at: string | null;
  claims_open_at: string | null;
  event_name: string;
}

interface FeedEntry {
  id: string;
  wallet_short: string;
  fighter_pick: string;
  amount_lamports: number;
  fight_id: string;
  created_at: string;
}

function calcOdds(poolA: number, poolB: number) {
  const total = poolA + poolB;
  if (total === 0) return { oddsA: 2.0, oddsB: 2.0 };
  return {
    oddsA: poolA > 0 ? total / poolA : 0,
    oddsB: poolB > 0 ? total / poolB : 0,
  };
}

function FightCard({
  fight,
  onPredict,
  wallet,
  userEntries,
  onClaim,
  claiming,
}: {
  fight: Fight;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  wallet: string | null;
  userEntries: any[];
  onClaim: (fightId: string) => void;
  claiming: boolean;
}) {
  const { oddsA, oddsB } = calcOdds(fight.pool_a_lamports, fight.pool_b_lamports);
  const totalPool = (fight.pool_a_lamports + fight.pool_b_lamports) / LAMPORTS;

  const hasWinningEntries =
    fight.status === "resolved" &&
    fight.winner &&
    userEntries.some((e) => e.fighter_pick === fight.winner && !e.claimed);

  const claimsOpen =
    fight.claims_open_at && new Date() >= new Date(fight.claims_open_at);

  // Parse title: "Fight 8 — 165 lbs — C-Class" or "Main Event — 139 lbs — A-Class"
  const titleParts = fight.title.split(' — ');
  const fightLabel = titleParts[0] || fight.title;
  const weight = titleParts[1] || null;
  const fightClass = titleParts[2] || null;

  return (
    <Card className="bg-card border-border/50 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {fight.event_name}
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              fight.status === "open"
                ? "bg-green-500/20 text-green-400"
                : fight.status === "locked"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-primary/20 text-primary"
            }`}
          >
            {fight.status === "open"
              ? "PREDICTIONS OPEN"
              : fight.status === "locked"
              ? "LOCKED"
              : "RESOLVED"}
          </span>
        </div>
        <h3 className="text-lg font-bold text-foreground mt-1 font-['Cinzel']">
          {fightLabel}
        </h3>
        {(weight || fightClass) && (
          <div className="flex items-center gap-2 mt-1">
            {weight && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground">
                {weight}
              </span>
            )}
            {fightClass && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                fightClass.startsWith('A') ? 'bg-primary/30 text-primary' :
                fightClass.startsWith('B') ? 'bg-secondary text-secondary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {fightClass}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Fighters */}
      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Fighter A */}
          <div className="text-center">
            <p className="font-bold text-foreground text-sm sm:text-base">{fight.fighter_a_name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Pool: {(fight.pool_a_lamports / LAMPORTS).toFixed(2)} SOL
            </p>
            <p className="text-primary font-bold text-lg">{oddsA.toFixed(2)}x</p>
            {fight.status === "open" && (
              <Button
                size="sm"
                className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onPredict(fight, "fighter_a")}
                disabled={!wallet}
              >
                Predict
              </Button>
            )}
            {fight.status === "resolved" && fight.winner === "fighter_a" && (
              <div className="mt-2 flex items-center justify-center gap-1 text-primary">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-bold">WINNER</span>
              </div>
            )}
          </div>

          {/* VS divider */}
          <div className="flex flex-col items-center">
            <Swords className="w-6 h-6 text-primary/60" />
            <span className="text-xs text-muted-foreground font-bold">VS</span>
          </div>

          {/* Fighter B */}
          <div className="text-center">
            <p className="font-bold text-foreground text-sm sm:text-base">{fight.fighter_b_name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Pool: {(fight.pool_b_lamports / LAMPORTS).toFixed(2)} SOL
            </p>
            <p className="text-primary font-bold text-lg">{oddsB.toFixed(2)}x</p>
            {fight.status === "open" && (
              <Button
                size="sm"
                className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onPredict(fight, "fighter_b")}
                disabled={!wallet}
              >
                Predict
              </Button>
            )}
            {fight.status === "resolved" && fight.winner === "fighter_b" && (
              <div className="mt-2 flex items-center justify-center gap-1 text-primary">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-bold">WINNER</span>
              </div>
            )}
          </div>
        </div>

        {/* Total pool */}
        <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total Prediction Pool</span>
          <span className="text-sm font-bold text-primary">{totalPool.toFixed(2)} SOL</span>
        </div>

        {/* Claim button */}
        {hasWinningEntries && claimsOpen && (
          <Button
            className="w-full mt-3 bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold"
            onClick={() => onClaim(fight.id)}
            disabled={claiming}
          >
            {claiming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trophy className="w-4 h-4 mr-2" />}
            Claim Reward
          </Button>
        )}
        {hasWinningEntries && !claimsOpen && (
          <p className="text-xs text-center text-muted-foreground mt-3">
            Claims open shortly after resolution...
          </p>
        )}
      </div>
    </Card>
  );
}

function PredictionModal({
  fight,
  pick,
  onClose,
  onSubmit,
  submitting,
}: {
  fight: Fight;
  pick: "fighter_a" | "fighter_b";
  onClose: () => void;
  onSubmit: (amount: number) => void;
  submitting: boolean;
}) {
  const [amount, setAmount] = useState("");
  const amountNum = parseFloat(amount) || 0;
  const fee = amountNum * FEE_RATE;
  const poolContribution = amountNum - fee;
  const fighterName = pick === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name;

  const { oddsA, oddsB } = calcOdds(fight.pool_a_lamports, fight.pool_b_lamports);
  const currentOdds = pick === "fighter_a" ? oddsA : oddsB;
  const estimatedReward = poolContribution * currentOdds;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground font-['Cinzel']">
            Predict: {fighterName}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Prediction Amount (SOL)</label>
            <input
              type="number"
              min={MIN_SOL}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full mt-1 px-4 py-3 rounded-lg bg-input border border-border text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {amountNum > 0 && (
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Prediction Amount</span>
                <span className="text-foreground font-medium">{amountNum.toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Platform Fee (5%)</span>
                <span className="text-destructive font-medium">-{fee.toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pool Contribution</span>
                <span className="text-foreground font-medium">{poolContribution.toFixed(4)} SOL</span>
              </div>
              <div className="border-t border-border/30 pt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated Reward</span>
                <span className="text-primary font-bold">{estimatedReward.toFixed(4)} SOL</span>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                *Reward estimate based on current odds. Final reward depends on pool at close.
              </p>
            </div>
          )}

          <Button
            className="w-full bg-primary text-primary-foreground font-bold py-3"
            disabled={amountNum < MIN_SOL || submitting}
            onClick={() => onSubmit(amountNum)}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {submitting ? "Submitting..." : "Submit Prediction"}
          </Button>

          {amountNum > 0 && amountNum < MIN_SOL && (
            <p className="text-xs text-destructive text-center">
              Minimum prediction: {MIN_SOL} SOL
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FightPredictions() {
  const { address, publicKey, isConnected, sendTransaction, connection } = useWallet();
  const [fights, setFights] = useState<Fight[]>([]);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [showFeed, setShowFeed] = useState(true);
  const [userEntries, setUserEntries] = useState<any[]>([]);
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [selectedPick, setSelectedPick] = useState<"fighter_a" | "fighter_b" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Load fights
  const loadFights = useCallback(async () => {
    const { data } = await supabase
      .from("prediction_fights")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setFights(data as any);
    setLoading(false);
  }, []);

  // Load user entries
  const loadUserEntries = useCallback(async () => {
    if (!address) return;
    const { data } = await supabase
      .from("prediction_entries")
      .select("*")
      .eq("wallet", address);
    if (data) setUserEntries(data);
  }, [address]);

  // Load feed
  const loadFeed = useCallback(async () => {
    const { data } = await supabase.functions.invoke("prediction-feed");
    if (data?.feed) setFeed(data.feed);
  }, []);

  useEffect(() => {
    loadFights();
    loadFeed();
  }, [loadFights, loadFeed]);

  useEffect(() => {
    loadUserEntries();
  }, [loadUserEntries]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("prediction-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prediction_fights" },
        () => loadFights()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "prediction_entries" },
        (payload) => {
          loadFeed();
          loadFights();
          if (address) loadUserEntries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFights, loadFeed, loadUserEntries, address]);

  // Submit prediction
  const handleSubmit = async (amountSol: number) => {
    if (!selectedFight || !selectedPick || !publicKey || !isConnected) return;
    setSubmitting(true);

    try {
      const amountLamports = Math.round(amountSol * LAMPORTS);
      const feeLamports = Math.floor(amountLamports * FEE_RATE);
      const poolLamports = amountLamports - feeLamports;

      // For now, send the full amount to the vault (edge function verifier wallet)
      // The edge function handles fee accounting in the database
      // In production, this should be split into treasury + vault transfers
      const vaultWallet = new PublicKey("11111111111111111111111111111111"); // placeholder - needs vault address

      // Create SOL transfer tx
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: vaultWallet,
          lamports: amountLamports,
        })
      );

      const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const conn = new Connection(rpcUrl, "confirmed");
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signature = await sendTransaction(tx, conn);

      // Wait for confirmation
      await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      // Submit to edge function
      const { data, error } = await supabase.functions.invoke("prediction-submit", {
        body: {
          fight_id: selectedFight.id,
          wallet: address,
          fighter_pick: selectedPick,
          amount_lamports: amountLamports,
          tx_signature: signature,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Prediction submitted!", {
        description: `${amountSol} SOL on ${
          selectedPick === "fighter_a"
            ? selectedFight.fighter_a_name
            : selectedFight.fighter_b_name
        }`,
      });

      setSelectedFight(null);
      setSelectedPick(null);
      loadFights();
      loadUserEntries();
    } catch (err: any) {
      console.error("Prediction failed:", err);
      toast.error("Prediction failed", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Claim reward
  const handleClaim = async (fightId: string) => {
    if (!address) return;
    setClaiming(true);

    try {
      const { data, error } = await supabase.functions.invoke("prediction-claim", {
        body: { fight_id: fightId, wallet: address },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Reward claimed!", {
        description: `${data.reward_sol?.toFixed(4)} SOL sent to your wallet`,
      });
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

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="max-w-4xl mx-auto px-4 pt-24 pb-8 relative">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-4">
              <Swords className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">
                Prediction Market
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground font-['Cinzel'] mb-2">
              Fight Predictions
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Predict fight outcomes and earn rewards. All predictions are final.
            </p>
          </div>
        </div>
      </div>

      {/* Fight Cards */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : fights.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Swords className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No fight predictions available yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {fights.map((fight) => (
              <FightCard
                key={fight.id}
                fight={fight}
                wallet={address}
                onPredict={(f, pick) => {
                  if (!isConnected) {
                    toast.error("Connect your wallet to make predictions");
                    return;
                  }
                  setSelectedFight(f);
                  setSelectedPick(pick);
                }}
                userEntries={userEntries.filter((e) => e.fight_id === fight.id)}
                onClaim={handleClaim}
                claiming={claiming}
              />
            ))}
          </div>
        )}

        {/* Live Activity Feed */}
        <div className="mt-8">
          <button
            className="w-full flex items-center justify-between bg-card border border-border/50 rounded-lg px-4 py-3"
            onClick={() => setShowFeed(!showFeed)}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">Live Predictions</span>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
            {showFeed ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showFeed && (
            <div className="mt-2 bg-card border border-border/50 rounded-lg divide-y divide-border/20 max-h-64 overflow-y-auto">
              {feed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No predictions yet. Be the first!
                </p>
              ) : (
                feed.map((entry) => (
                  <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground">
                        {entry.wallet_short}
                      </span>
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
          <div className="mt-8">
            <h2 className="text-lg font-bold text-foreground font-['Cinzel'] mb-3">
              Your Predictions
            </h2>
            <div className="bg-card border border-border/50 rounded-lg divide-y divide-border/20">
              {userEntries.map((entry) => {
                const f = fights.find((f) => f.id === entry.fight_id);
                return (
                  <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {getFighterName(entry.fight_id, entry.fighter_pick)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {f?.title || ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">
                        {(entry.amount_lamports / LAMPORTS).toFixed(2)} SOL
                      </p>
                      {entry.claimed && (
                        <p className="text-xs text-green-400">✓ Claimed</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Prediction Modal */}
      {selectedFight && selectedPick && (
        <PredictionModal
          fight={selectedFight}
          pick={selectedPick}
          onClose={() => {
            setSelectedFight(null);
            setSelectedPick(null);
          }}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}
    </div>
  );
}
