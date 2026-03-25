import { Button } from "@/components/ui/button";
import { Loader2, Coins, Wallet, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import ApprovalStepIndicator from "./ApprovalStepIndicator";
import type { ApprovalStep } from "@/hooks/useAllowanceGate";

const MIN_USD = 1.0;

interface TradeTicketProps {
  amount: string;
  setAmount: (v: string) => void;
  amountNum: number;
  availableBalance: number;
  balanceLoading: boolean;
  usdc_balance_formatted: string | null;
  fee: number;
  feeLabel: string;
  netAmount: number;
  estimatedReward: number;
  insufficientFunds: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: (amount: number) => void;
  minUsd: number;
  approvalStep?: ApprovalStep;
  approvalError?: string | null;
}

export default function TradeTicket({
  amount,
  setAmount,
  amountNum,
  availableBalance,
  balanceLoading,
  usdc_balance_formatted,
  fee,
  feeLabel,
  netAmount,
  estimatedReward,
  insufficientFunds,
  canSubmit,
  submitting,
  onSubmit,
  minUsd,
  approvalStep = "idle",
  approvalError = null,
}: TradeTicketProps) {
  const isApproving = ["checking_allowance", "approval_required", "waiting_wallet", "approval_submitted", "waiting_confirmation"].includes(approvalStep);

  // Button label based on current step
  const getButtonLabel = () => {
    if (approvalStep === "checking_allowance") return "Checking approval…";
    if (approvalStep === "waiting_wallet") return "Approve in wallet…";
    if (approvalStep === "approval_submitted" || approvalStep === "waiting_confirmation") return "Confirming approval…";
    if (submitting) return "Submitting…";
    return "Submit Prediction";
  };

  return (
    <div className="space-y-4">
      {/* Balance bar */}
      <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="w-4 h-4" />
          <span>Available</span>
        </div>
        <span className="text-sm font-bold text-foreground">
          {balanceLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
          ) : usdc_balance_formatted != null ? (
            `$${usdc_balance_formatted} USDC`
          ) : (
            "—"
          )}
        </span>
      </div>

      {/* Amount input */}
      <div>
        <label className="text-sm text-muted-foreground">Amount (USDC)</label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">$</span>
          <input
            type="number"
            min={minUsd}
            step="0.50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full pl-8 pr-4 py-3 rounded-lg bg-input border border-border text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Quick amount buttons */}
        <div className="flex gap-2 mt-2">
          {[5, 10, 25, 50].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              className="flex-1 text-xs font-medium py-1.5 rounded-md bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors border border-border/50"
            >
              ${v}
            </button>
          ))}
        </div>

        <Link
          to="/add-funds"
          className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Coins className="w-3 h-3" />
          Need USDC? Add funds →
        </Link>
      </div>

      {/* Fee breakdown */}
      {amountNum > 0 && (
        <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="text-foreground font-medium">${amountNum.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Platform Fee ({feeLabel})</span>
            <span className="text-destructive font-medium">-${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-border/30 pt-2">
            <span className="text-muted-foreground">Trade Amount</span>
            <span className="text-foreground font-bold">${netAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Est. Reward</span>
            <span className="text-primary font-bold">${estimatedReward.toFixed(2)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            *Based on current odds. Final reward depends on pool at close.
          </p>
        </div>
      )}

      {/* Approval step indicator */}
      <ApprovalStepIndicator step={approvalStep} errorReason={approvalError} />

      {/* Insufficient funds warning */}
      {insufficientFunds && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">
            Insufficient balance.{" "}
            <Link to="/add-funds" className="underline font-medium">
              Add USDC
            </Link>
          </p>
        </div>
      )}

      {/* Submit */}
      <Button
        className="w-full font-bold py-3"
        size="lg"
        disabled={!canSubmit || isApproving}
        onClick={() => onSubmit(amountNum)}
      >
        {(submitting || isApproving) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {getButtonLabel()}
      </Button>

      {amountNum > 0 && amountNum < minUsd && (
        <p className="text-xs text-destructive text-center">
          Minimum: ${minUsd.toFixed(2)}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground/50 text-center">
        First prediction requires a one-time USDC approval. No charge until you submit.
      </p>
    </div>
  );
}
