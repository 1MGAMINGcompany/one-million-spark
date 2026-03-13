import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Fight } from "./FightCard";

const MIN_SOL = 0.05;
const FEE_RATE = 0.05;
const LAMPORTS = 1_000_000_000;

function calcOdds(poolA: number, poolB: number) {
  const total = poolA + poolB;
  if (total === 0) return { oddsA: 2.0, oddsB: 2.0 };
  return {
    oddsA: poolA > 0 ? total / poolA : 0,
    oddsB: poolB > 0 ? total / poolB : 0,
  };
}

export default function PredictionModal({
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
            <label className="text-sm text-muted-foreground">Amount (SOL)</label>
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
                <span className="text-muted-foreground">Amount</span>
                <span className="text-foreground font-medium">{amountNum.toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fee (5%)</span>
                <span className="text-destructive font-medium">-{fee.toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pool Contribution</span>
                <span className="text-foreground font-medium">{poolContribution.toFixed(4)} SOL</span>
              </div>
              <div className="border-t border-border/30 pt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Est. Reward</span>
                <span className="text-primary font-bold">{estimatedReward.toFixed(4)} SOL</span>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                *Based on current odds. Final reward depends on pool at close.
              </p>
            </div>
          )}

          <Button
            className="w-full bg-primary text-primary-foreground font-bold py-3"
            disabled={amountNum < MIN_SOL || submitting}
            onClick={() => onSubmit(amountNum)}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {submitting ? "Submitting..." : "Submit Prediction"}
          </Button>

          {amountNum > 0 && amountNum < MIN_SOL && (
            <p className="text-xs text-destructive text-center">
              Minimum: {MIN_SOL} SOL
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
