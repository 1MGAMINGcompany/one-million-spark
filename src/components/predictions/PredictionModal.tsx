import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Eye, Clock, Trophy, Coins, Share2, Copy, AlertTriangle, Wallet, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import type { Fight } from "./FightCard";
import { useMyReferralCode } from "@/hooks/useMyReferralCode";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { usePolygonBalances, type FundingState } from "@/hooks/usePolygonBalances";
import SocialShareModal from "@/components/SocialShareModal";
import { SOCIAL_SHARE_ENABLED } from "@/lib/socialShareConfig";
import type { RequoteData } from "./tradeResultTypes";
import PredictionSuccessScreen from "./PredictionSuccessScreen";
import TradeTicket from "./TradeTicket";
import type { TradeResult } from "./tradeResultTypes";
import type { ApprovalStep } from "@/hooks/useAllowanceGate";
import { useLiveGameState } from "@/hooks/useSportsWebSocket";

const MIN_USD = 5.0;

/** Source-aware fee rate */
function getFeeRate(fight: Fight): number {
  if (fight.commission_bps != null) return fight.commission_bps / 10_000;
  return fight.source === "polymarket" ? 0.0225 : 0.05;
}

function getFeeLabel(fight: Fight): string {
  const bps = fight.commission_bps ?? (fight.source === "polymarket" ? 225 : 500);
  return `${(bps / 100).toFixed(1)}%`;
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
  approvalStep,
  approvalError,
  operatorBrandName,
  operatorLogoUrl,
  operatorSubdomain,
  requoteData,
  onAcceptRequote,
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
  operatorBrandName?: string;
  operatorLogoUrl?: string | null;
  operatorSubdomain?: string;
  requoteData?: RequoteData | null;
  onAcceptRequote?: () => void;
}) {
  const referralCode = useMyReferralCode(wallet ?? null);
  const { usdc_balance, usdc_balance_formatted, is_loading: balanceLoading } = usePolygonUSDC();
  const { fundingState, nativeUsdcBalance, nativeUsdcFormatted } = usePolygonBalances();
  const [amount, setAmount] = useState("5");
  const amountNum = parseFloat(amount) || 0;
  const feeRate = getFeeRate(fight);
  const fee = amountNum * feeRate;
  const netAmount = amountNum - fee;
  const fighterName = pick === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name;
  const feeLabel = getFeeLabel(fight);

  const { poolA, poolB } = getPoolUsd(fight);
  const estimatedReward = estimateReward(poolA, poolB, pick, netAmount);

  // Odds / multiplier for picked fighter
  const pickedPrice = pick === "fighter_a" ? (fight.price_a ?? 0) : (fight.price_b ?? 0);
  const multiplier = pickedPrice > 0 ? (1 / pickedPrice) : 0;
  const winChance = pickedPrice > 0 ? (pickedPrice * 100) : 0;

  // Payout calculation
  const potentialPayout = multiplier > 0 ? netAmount * multiplier : estimatedReward;

  // Live game state
  const liveState = useLiveGameState((fight as any).polymarket_slug);

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
        operatorBrandName={operatorBrandName}
        operatorLogoUrl={operatorLogoUrl}
        operatorSubdomain={operatorSubdomain}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 animate-in slide-in-from-bottom">
        {/* Header — game context */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-foreground font-['Cinzel']">
            {fight.fighter_a_name} vs {fight.fighter_b_name}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Live badge with score/period */}
        {liveState && liveState.live && (
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="flex items-center gap-1 text-red-500 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
            {(liveState.period || liveState.elapsed) && (
              <span className="text-muted-foreground font-mono">
                {[liveState.period, liveState.elapsed].filter(Boolean).join(" • ")}
              </span>
            )}
            {liveState.score && (
              <span className="font-bold font-mono text-foreground">
                Score: {liveState.score}
              </span>
            )}
          </div>
        )}

        {/* User pick summary */}
        <div className="rounded-xl p-3 mb-4 bg-secondary/50 border border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Your Pick</p>
              <p className="text-base font-bold text-foreground">{fighterName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Odds</p>
              <p className="text-lg font-black text-primary">
                {multiplier > 0 ? `${multiplier.toFixed(2)}x` : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Win Chance</p>
              <p className="text-sm font-bold text-foreground">
                {winChance > 0 ? `${winChance.toFixed(1)}%` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Requote banner */}
        {requoteData && (
          <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-sm font-bold text-foreground">Odds Changed</p>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Previous odds</span>
              <span className="text-muted-foreground line-through">{((1 / requoteData.old_price) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">New odds</span>
              <span className="font-bold text-primary">{((1 / requoteData.new_price) * 100).toFixed(0)}% → ${requoteData.updated_payout.toFixed(2)}</span>
            </div>
            <Button
              className="w-full font-bold"
              onClick={() => { onAcceptRequote?.(); onSubmit(amountNum); }}
              disabled={submitting}
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Accept New Odds & Submit
            </Button>
          </div>
        )}

        {/* Big payout box — always visible when amount > 0 */}
        {amountNum >= MIN_USD && potentialPayout > 0 && (
          <div className="rounded-xl p-4 mb-4 text-center bg-gradient-to-b from-primary/10 to-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground mb-1">💰 You Win</p>
            <p className="text-3xl font-black text-primary">
              ${potentialPayout.toFixed(2)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              ${netAmount.toFixed(2)} × {multiplier > 0 ? multiplier.toFixed(2) : "odds"}
            </p>
          </div>
        )}

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
          canSubmit={canSubmit && !requoteData}
          submitting={submitting}
          onSubmit={onSubmit}
          minUsd={MIN_USD}
          approvalStep={approvalStep}
          approvalError={approvalError}
          fundingState={fundingState}
          nativeUsdcFormatted={nativeUsdcFormatted}
          isPolymarket={fight.source === "polymarket"}
        />
      </div>
    </div>
  );
}
