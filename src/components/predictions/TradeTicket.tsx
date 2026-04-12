import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Wallet, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { Link } from "react-router-dom";
import ApprovalStepIndicator from "./ApprovalStepIndicator";
import type { ApprovalStep } from "@/hooks/useAllowanceGate";
import type { FundingState } from "@/hooks/usePolygonBalances";
import { useSwapToUsdce } from "@/hooks/useSwapToUsdce";
import { toast } from "sonner";

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
  fundingState?: FundingState;
  nativeUsdcFormatted?: string | null;
  isPolymarket?: boolean;
  potentialPayout?: number;
}

export default function TradeTicket({
  amount, setAmount, amountNum, availableBalance, balanceLoading, usdc_balance_formatted,
  fee, feeLabel, netAmount, estimatedReward, insufficientFunds, canSubmit, submitting, onSubmit,
  minUsd, approvalStep = "idle", approvalError = null, fundingState = "funded",
  nativeUsdcFormatted = null, isPolymarket = false, potentialPayout = 0,
}: TradeTicketProps) {
  const { t } = useTranslation();
  const isApproving = ["checking_allowance", "approval_required", "waiting_wallet", "approval_submitted", "waiting_confirmation"].includes(approvalStep);
  const { getQuote, quoting } = useSwapToUsdce();
  const [swapping, setSwapping] = useState(false);

  const needsConversion = fundingState === "wrong_token";
  const noFunds = fundingState === "no_funds";

  // Quick chips: only show values >= minUsd
  const quickChips = [5, 10, 25, 50].filter(v => v >= minUsd);

  const handleConvert = async () => {
    if (!nativeUsdcFormatted) return;
    setSwapping(true);
    try {
      const amt = parseFloat(nativeUsdcFormatted);
      if (!amt || amt < 0.01) { toast.error(t("prediction.amountTooSmall")); return; }
      const q = await getQuote(amt);
      if (q) {
        toast.success(t("prediction.swapQuoteReady"), { duration: 2000 });
        window.location.href = "/add-funds?action=convert";
      }
    } catch (err: any) {
      toast.error(t("prediction.conversionFailed"), { description: err?.message });
    } finally {
      setSwapping(false);
    }
  };

  const getButtonLabel = () => {
    if (approvalStep === "checking_allowance") return t("prediction.checkingApproval");
    if (approvalStep === "waiting_wallet") return t("prediction.approveInWallet");
    if (approvalStep === "approval_submitted" || approvalStep === "waiting_confirmation") return t("prediction.confirmingApproval");
    if (submitting) return t("prediction.submitting");
    return amountNum >= minUsd ? `${t("prediction.placePrediction")} ($${amountNum.toFixed(0)})` : t("prediction.placePrediction");
  };

  return (
    <div className="space-y-3">
      {/* Funding state banners */}
      {needsConversion && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 sm:p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-sm font-medium text-foreground">{t("prediction.convertUSDC")}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("prediction.haveUSDC", { amount: nativeUsdcFormatted })}
          </p>
          <Button className="w-full font-bold" size="sm" onClick={handleConvert} disabled={swapping || quoting}>
            {(swapping || quoting) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {t("prediction.convertToTrading")}
          </Button>
        </div>
      )}

      {noFunds && !needsConversion && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 sm:p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm font-medium text-foreground">{t("prediction.noFunds")}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t("prediction.addUSDCToPredict")}</p>
          <Link to="/add-funds">
            <Button className="w-full font-bold" size="sm" variant="default">
              <Coins className="w-4 h-4 mr-2" /> {t("prediction.addFunds")}
            </Button>
          </Link>
        </div>
      )}

      {/* Balance bar */}
      <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="w-4 h-4" />
          <span>{t("prediction.tradingBalance")}</span>
        </div>
        <span className="text-sm font-bold text-foreground">
          {balanceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> :
            usdc_balance_formatted != null ? `$${usdc_balance_formatted} USDC.e` : "—"}
        </span>
      </div>

      {/* Amount input */}
      <div>
        <label className="text-sm text-muted-foreground">
          {t("prediction.enterAmount")} ({t("prediction.minimum")} ${minUsd})
        </label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">$</span>
          <input
            type="number" min={minUsd} step="1" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder={minUsd.toString()}
            disabled={needsConversion || noFunds}
            className="w-full pl-8 pr-4 py-3 rounded-lg bg-input border border-border text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
        </div>

        {/* Quick amount chips */}
        <div className="flex gap-2 mt-2">
          {quickChips.map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))} disabled={needsConversion || noFunds}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors border ${
                amountNum === v
                  ? "bg-primary/20 border-primary/50 text-primary font-bold"
                  : "bg-secondary/60 border-border/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
              } disabled:opacity-50`}>
              ${v}
            </button>
          ))}
        </div>

        <Link to="/add-funds" className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary hover:text-primary/80 transition-colors">
          <Coins className="w-3 h-3" /> {t("prediction.needUSDC")}
        </Link>
      </div>

      {/* Fee breakdown */}
      {amountNum > 0 && (
        <div className="bg-secondary/50 rounded-lg p-3 sm:p-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("prediction.amount")}</span>
            <span className="text-foreground font-medium">${amountNum.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("prediction.fee")} ({feeLabel})</span>
            <span className="text-destructive font-medium">-${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-border/30 pt-1.5">
            <span className="text-muted-foreground">{t("prediction.netAmount")}</span>
            <span className="text-foreground font-bold">${netAmount.toFixed(2)}</span>
          </div>
          {potentialPayout > 0 && amountNum >= minUsd && (
            <div className="flex justify-between text-sm border-t border-border/30 pt-1.5">
              <span className="text-muted-foreground">{t("prediction.potentialPayout")}</span>
              <span className="text-green-500 font-bold">${potentialPayout.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Approval step indicator */}
      <ApprovalStepIndicator step={approvalStep} errorReason={approvalError} />

      {/* Insufficient funds warning */}
      {insufficientFunds && !needsConversion && !noFunds && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">
            {t("prediction.insufficientBalance")}{" "}
            <Link to="/add-funds" className="underline font-medium">{t("prediction.addFunds")}</Link>
          </p>
        </div>
      )}

      {/* Below minimum warning */}
      {amountNum > 0 && amountNum < minUsd && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">
            {t("prediction.minimumAmount", { min: minUsd.toFixed(0) })}
          </p>
        </div>
      )}

      {/* Submit */}
      <Button className="w-full font-bold py-3 text-base" size="lg"
        disabled={!canSubmit || isApproving || needsConversion || noFunds}
        onClick={() => onSubmit(amountNum)}>
        {(submitting || isApproving) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {getButtonLabel()}
      </Button>

      <p className="text-[10px] text-muted-foreground/50 text-center">
        {t("prediction.firstPredictionNote")}
      </p>
    </div>
  );
}
