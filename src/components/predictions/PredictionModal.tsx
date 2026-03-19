import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Eye, Clock, Trophy, Coins, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Fight } from "./FightCard";
import { useMyReferralCode } from "@/hooks/useMyReferralCode";
import SocialShareModal from "@/components/SocialShareModal";
import { SOCIAL_SHARE_ENABLED } from "@/lib/socialShareConfig";

const MIN_USD = 1.0; // Minimum prediction in USD

/** Source-aware fee rate: 2% for Polymarket, 5% for native */
function getFeeRate(fight: Fight): number {
  if (fight.commission_bps != null) return fight.commission_bps / 10_000;
  return fight.source === "polymarket" ? 0.02 : 0.05;
}

function getFeeLabel(fight: Fight): string {
  const bps = fight.commission_bps ?? (fight.source === "polymarket" ? 200 : 500);
  return `${(bps / 100).toFixed(0)}%`;
}

// TODO [POLYMARKET]: Replace static reward estimation with Polymarket
// CLOB order book pricing when market data layer is connected.
function estimateReward(
  poolA: number,
  poolB: number,
  pick: "fighter_a" | "fighter_b",
  contribution: number,
): number {
  if (contribution <= 0) return 0;
  const pickedPool = pick === "fighter_a" ? poolA : poolB;
  const newPickedPool = pickedPool + contribution;
  const newTotal = poolA + poolB + contribution;
  return (contribution / newPickedPool) * newTotal;
}

/** Get USD pool value — prefers new columns, falls back to legacy lamports / 1e9 */
function getPoolUsd(fight: Fight): { poolA: number; poolB: number } {
  if ((fight.pool_a_usd != null && fight.pool_a_usd > 0) || (fight.pool_b_usd != null && fight.pool_b_usd > 0)) {
    return { poolA: fight.pool_a_usd ?? 0, poolB: fight.pool_b_usd ?? 0 };
  }
  return { poolA: fight.pool_a_lamports / 1_000_000_000, poolB: fight.pool_b_lamports / 1_000_000_000 };
}

export default function PredictionModal({
  fight,
  pick,
  onClose,
  onSubmit,
  submitting,
  showSuccess,
  wallet,
}: {
  fight: Fight;
  pick: "fighter_a" | "fighter_b";
  onClose: () => void;
  onSubmit: (amount: number) => void;
  submitting: boolean;
  showSuccess?: boolean;
  wallet?: string;
}) {
  const referralCode = useMyReferralCode(wallet ?? null);
  const [amount, setAmount] = useState("");
  const amountNum = parseFloat(amount) || 0;
  const feeRate = getFeeRate(fight);
  const fee = amountNum * feeRate;
  const poolContribution = amountNum - fee;
  const fighterName = pick === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name;
  const feeLabel = getFeeLabel(fight);

  const { poolA, poolB } = getPoolUsd(fight);

  const estimatedReward = estimateReward(
    poolA,
    poolB,
    pick,
    poolContribution,
  );

  const [showShare, setShowShare] = useState(false);

  // Success explainer screen
  if (showSuccess) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 animate-in slide-in-from-bottom">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-foreground font-['Cinzel']">
                Prediction Placed!
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                You picked <span className="font-bold text-foreground">{fighterName}</span>
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <h4 className="text-sm font-bold text-foreground text-center">What Happens Next?</h4>

              <div className="flex items-start gap-3 bg-secondary/30 rounded-lg p-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Eye className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">1. Watch the fight</p>
                  <p className="text-xs text-muted-foreground">Sit back and wait for the result</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-secondary/30 rounded-lg p-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">2. Short safety buffer (~5 min)</p>
                  <p className="text-xs text-muted-foreground">After the result, a brief verification period ensures fair payouts</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-secondary/30 rounded-lg p-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">3. Claim your reward</p>
                  <p className="text-xs text-muted-foreground">
                    If your fighter wins, a <span className="font-bold text-foreground">Claim Reward</span> button appears — tap it to receive your payout
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {SOCIAL_SHARE_ENABLED && (
                <Button variant="outline" className="gap-1.5" onClick={() => setShowShare(true)}>
                  <Share2 className="w-4 h-4" /> Share Pick
                </Button>
              )}
              <Button onClick={onClose} className="flex-1" size="lg">
                Got it!
              </Button>
            </div>
          </div>
        </div>

        {SOCIAL_SHARE_ENABLED && (
          <SocialShareModal
            open={showShare}
            onClose={() => setShowShare(false)}
            variant="prediction"
            eventTitle={fight.title}
            sport={fight.event_name}
            fighterPick={fighterName}
            amountUsd={amountNum}
            poolUsd={poolA + poolB}
            wallet={wallet}
            referralCode={referralCode ?? undefined}
          />
        )}
      </>
    );
  }

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
            <label className="text-sm text-muted-foreground">Amount (USD)</label>
            <input
              type="number"
              min={MIN_USD}
              step="0.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full mt-1 px-4 py-3 rounded-lg bg-input border border-border text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {/* TODO [POLYMARKET]: Add fund wallet deep link for Polygon */}
            <Link
              to="/add-funds"
              className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Coins className="w-3 h-3" />
              Need funds? Learn how to add funds →
            </Link>
          </div>

          {amountNum > 0 && (
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-foreground font-medium">${amountNum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fee ({feeLabel})</span>
                <span className="text-destructive font-medium">-${fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pool Contribution</span>
                <span className="text-foreground font-medium">${poolContribution.toFixed(2)}</span>
              </div>
              <div className="border-t border-border/30 pt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Est. Reward</span>
                <span className="text-primary font-bold">${estimatedReward.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                *Based on current odds. Final reward depends on pool at close.
              </p>
            </div>
          )}

          <Button
            className="w-full bg-primary text-primary-foreground font-bold py-3"
            disabled={amountNum < MIN_USD || submitting}
            onClick={() => onSubmit(amountNum)}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {submitting ? "Submitting..." : "Submit Prediction"}
          </Button>

          {amountNum > 0 && amountNum < MIN_USD && (
            <p className="text-xs text-destructive text-center">
              Minimum: ${MIN_USD.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
