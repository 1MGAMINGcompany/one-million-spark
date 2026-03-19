import { Button } from "@/components/ui/button";
import { CheckCircle2, Eye, Clock, Trophy, Share2, AlertTriangle, Loader2 } from "lucide-react";
import SocialShareModal from "@/components/SocialShareModal";
import { SOCIAL_SHARE_ENABLED } from "@/lib/socialShareConfig";
import { useTradeStatusPoll } from "@/hooks/useTradeStatusPoll";
import type { Fight } from "./FightCard";
import type { TradeResult } from "./tradeResultTypes";

interface Props {
  fighterName: string;
  amountNum: number;
  fight: Fight;
  poolA: number;
  poolB: number;
  onClose: () => void;
  wallet?: string;
  referralCode: string | null;
  showShare: boolean;
  setShowShare: (v: boolean) => void;
  tradeResult?: TradeResult | null;
}

/* ── Status display helpers ── */

type StatusDisplay = { icon: React.ReactNode; title: string; subtitle: string };

function getStatusDisplay(status: string | undefined): StatusDisplay {
  switch (status) {
    case "filled":
      return {
        icon: <CheckCircle2 className="w-8 h-8 text-green-400" />,
        title: "Trade Filled!",
        subtitle: "Your prediction has been executed.",
      };
    case "partial_fill":
      return {
        icon: <Loader2 className="w-8 h-8 text-yellow-400" />,
        title: "Partially Filled",
        subtitle: "Part of your order was filled. The rest is still processing.",
      };
    case "submitted":
    case "requested":
      return {
        icon: <Clock className="w-8 h-8 text-primary" />,
        title: "Trade Processing",
        subtitle: "Your trade has been submitted and is being confirmed.",
      };
    case "failed":
      return {
        icon: <AlertTriangle className="w-8 h-8 text-destructive" />,
        title: "Trade Failed",
        subtitle: "Something went wrong. No funds were taken.",
      };
    default:
      return {
        icon: <CheckCircle2 className="w-8 h-8 text-green-400" />,
        title: "Prediction Placed!",
        subtitle: "",
      };
  }
}

export default function PredictionSuccessScreen({
  fighterName,
  amountNum,
  fight,
  poolA,
  poolB,
  onClose,
  wallet,
  referralCode,
  showShare,
  setShowShare,
  tradeResult,
}: Props) {
  // Short-lived polling for non-final statuses
  const liveStatus = useTradeStatusPoll(
    tradeResult?.trade_order_id,
    tradeResult?.trade_status,
    wallet,
  );

  // Use live-polled status if available, otherwise initial
  const status = liveStatus?.status ?? tradeResult?.trade_status;
  const { icon, title, subtitle } = getStatusDisplay(status);
  const isFailed = status === "failed";

  // Prefer live backend values → initial backend values → frontend estimates
  const displayAmount = tradeResult?.requested_amount_usdc ?? amountNum;
  const displayFee = liveStatus?.fee_usdc ?? tradeResult?.fee_usdc ?? null;
  const displayNet = tradeResult?.net_amount_usdc ?? null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 animate-in slide-in-from-bottom">
          {/* Status header */}
          <div className="text-center mb-5">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                isFailed ? "bg-destructive/20" : status === "partial_fill" ? "bg-yellow-500/20" : "bg-green-500/20"
              }`}
            >
              {icon}
            </div>
            <h3 className="text-xl font-bold text-foreground font-['Cinzel']">{title}</h3>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
            {!isFailed && (
              <p className="text-sm text-muted-foreground mt-1">
                You picked <span className="font-bold text-foreground">{fighterName}</span>
              </p>
            )}
          </div>

          {/* Trade receipt */}
          {!isFailed && (displayAmount > 0 || displayFee != null) && (
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-foreground font-medium">${displayAmount.toFixed(2)}</span>
              </div>
              {displayFee != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Platform Fee{tradeResult?.fee_bps ? ` (${(tradeResult.fee_bps / 100).toFixed(0)}%)` : ""}
                  </span>
                  <span className="text-destructive font-medium">-${displayFee.toFixed(2)}</span>
                </div>
              )}
              {displayNet != null && (
                <div className="flex justify-between text-sm border-t border-border/30 pt-2">
                  <span className="text-muted-foreground">Executed</span>
                  <span className="text-foreground font-bold">${displayNet.toFixed(2)}</span>
                </div>
              )}
              {tradeResult?.trade_order_id && (
                <p className="text-[10px] text-muted-foreground/50 mt-1 truncate">
                  Ref: {tradeResult.trade_order_id.slice(0, 8)}
                </p>
              )}
            </div>
          )}

          {/* Next steps — only for non-failed */}
          {!isFailed && (
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
                  <p className="text-xs text-muted-foreground">A brief verification period ensures fair payouts</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-secondary/30 rounded-lg p-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">3. Claim your reward</p>
                  <p className="text-xs text-muted-foreground">
                    If your fighter wins, tap <span className="font-bold text-foreground">Claim Reward</span> to receive your payout
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {!isFailed && SOCIAL_SHARE_ENABLED && (
              <Button variant="outline" className="gap-1.5" onClick={() => setShowShare(true)}>
                <Share2 className="w-4 h-4" /> Share Pick
              </Button>
            )}
            <Button onClick={onClose} className="flex-1" size="lg">
              {isFailed ? "Close" : "Got it!"}
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
