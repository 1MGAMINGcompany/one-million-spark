import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Eye, Clock, Trophy, Coins, Share2, Copy, AlertTriangle, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import type { Fight } from "./FightCard";
import { useMyReferralCode } from "@/hooks/useMyReferralCode";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import SocialShareModal from "@/components/SocialShareModal";
import { SOCIAL_SHARE_ENABLED } from "@/lib/socialShareConfig";
import PredictionSuccessScreen from "./PredictionSuccessScreen";
import TradeTicket from "./TradeTicket";
import type { TradeResult } from "./tradeResultTypes";
import type { ApprovalStep } from "@/hooks/useAllowanceGate";

const MIN_USD = 1.0;

/** Source-aware fee rate: 2% for Polymarket, 5% for native */
function getFeeRate(fight: Fight): number {
  if (fight.commission_bps != null) return fight.commission_bps / 10_000;
  return fight.source === "polymarket" ? 0.02 : 0.05;
}

function getFeeLabel(fight: Fight): string {
  const bps = fight.commission_bps ?? (fight.source === "polymarket" ? 200 : 500);
  return `${(bps / 100).toFixed(0)}%`;
}

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
  tradeResult,
}: {
  fight: Fight;
  pick: "fighter_a" | "fighter_b";
  onClose: () => void;
  onSubmit: (amount: number) => void;
  submitting: boolean;
  showSuccess?: boolean;
  wallet?: string;
  tradeResult?: TradeResult | null;
  approvalStep?: ApprovalStep;
  approvalError?: string | null;
}) {
  const referralCode = useMyReferralCode(wallet ?? null);
  const { usdc_balance, usdc_balance_formatted, is_loading: balanceLoading } = usePolygonUSDC();
  const [amount, setAmount] = useState("");
  const amountNum = parseFloat(amount) || 0;
  const feeRate = getFeeRate(fight);
  const fee = amountNum * feeRate;
  const netAmount = amountNum - fee;
  const fighterName = pick === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name;
  const feeLabel = getFeeLabel(fight);

  const { poolA, poolB } = getPoolUsd(fight);
  const estimatedReward = estimateReward(poolA, poolB, pick, netAmount);

  const [showShare, setShowShare] = useState(false);

  const availableBalance = usdc_balance ?? 0;
  const insufficientFunds = amountNum > 0 && amountNum > availableBalance;
  const canSubmit = amountNum >= MIN_USD && !insufficientFunds && !submitting && !balanceLoading;

  if (showSuccess) {
    return (
      <PredictionSuccessScreen
        fighterName={fighterName}
        amountNum={amountNum}
        fight={fight}
        poolA={poolA}
        poolB={poolB}
        onClose={onClose}
        wallet={wallet}
        referralCode={referralCode}
        showShare={showShare}
        setShowShare={setShowShare}
        tradeResult={tradeResult}
      />
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

        <TradeTicket
          amount={amount}
          setAmount={setAmount}
          amountNum={amountNum}
          availableBalance={availableBalance}
          balanceLoading={balanceLoading}
          usdc_balance_formatted={usdc_balance_formatted}
          fee={fee}
          feeLabel={feeLabel}
          netAmount={netAmount}
          estimatedReward={estimatedReward}
          insufficientFunds={insufficientFunds}
          canSubmit={canSubmit}
          submitting={submitting}
          onSubmit={onSubmit}
          minUsd={MIN_USD}
        />
      </div>
    </div>
  );
}
