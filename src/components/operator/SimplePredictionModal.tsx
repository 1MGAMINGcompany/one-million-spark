import { useState, useEffect, useRef } from "react";
import { X, Loader2, Share2, AlertTriangle, RefreshCw, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import { getTeamLogo } from "@/lib/teamLogos";
import type { Fight } from "@/components/predictions/FightCard";
import type { TradeResult, RequoteData } from "@/components/predictions/tradeResultTypes";
import type { ApprovalStep } from "@/hooks/useAllowanceGate";
import ApprovalStepIndicator from "@/components/predictions/ApprovalStepIndicator";

function getFeeRate(fight: Fight): number {
  if (fight.commission_bps != null) return fight.commission_bps / 10_000;
  return fight.source === "polymarket" ? 0.0225 : 0.05;
}

function calcPayout(fight: Fight, pick: "fighter_a" | "fighter_b" | "draw", amount: number): number {
  if (amount <= 0) return 0;
  const fee = amount * getFeeRate(fight);
  const net = amount - fee;
  if (pick === "draw") return net * 3;
  const pA = fight.price_a ?? 0;
  const pB = fight.price_b ?? 0;
  let price = pick === "fighter_a" ? pA : pB;
  if (price <= 0) {
    const other = pick === "fighter_a" ? pB : pA;
    if (other > 0 && other <= 1) price = 1 - other;
  }
  if (price > 0) return net / price;
  const poolA = (fight.pool_a_usd ?? 0) || fight.pool_a_lamports / 1e9;
  const poolB = (fight.pool_b_usd ?? 0) || fight.pool_b_lamports / 1e9;
  const pickedPool = (pick === "fighter_a" ? poolA : poolB) + net;
  const totalPool = poolA + poolB + net;
  return totalPool > 0 ? (net / pickedPool) * totalPool : net;
}

interface Props {
  fight: Fight;
  pick: "fighter_a" | "fighter_b" | "draw";
  onClose: () => void;
  onSubmit: (amount: number) => void;
  submitting: boolean;
  showSuccess?: boolean;
  tradeResult?: TradeResult | null;
  approvalStep?: ApprovalStep;
  approvalError?: string | null;
  themeColor?: string;
  operatorBrandName?: string;
  onSharePick?: () => void;
  requoteData?: RequoteData | null;
  onAcceptRequote?: () => void;
}

export default function SimplePredictionModal({
  fight,
  pick,
  onClose,
  onSubmit,
  submitting,
  showSuccess,
  tradeResult,
  approvalStep,
  approvalError,
  themeColor = "#3b82f6",
  operatorBrandName,
  onSharePick,
  requoteData,
  onAcceptRequote,
}: Props) {
  const { t } = useTranslation();

  const isCustomEvent = !(fight as any).polymarket_market_id;
  const MIN_USD = isCustomEvent ? 2 : 5;
  const AMOUNTS = isCustomEvent ? [2, 5, 10, 25, 50] : [5, 10, 25, 50, 100];

  const [amount, setAmount] = useState(AMOUNTS[1]);
  const [customAmount, setCustomAmount] = useState("");

  const pickedName = pick === "draw"
    ? t("operator.draw")
    : resolveOutcomeName(
        pick === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name,
        pick === "fighter_a" ? "a" : "b",
        fight
      );
  const logoData = pick !== "draw" ? getTeamLogo(pickedName, fight.event_name) : null;
  const logo = logoData?.url || null;
  const currentAmount = customAmount ? parseFloat(customAmount) || 0 : amount;
  const payout = calcPayout(fight, pick, currentAmount);
  const profit = payout - currentAmount;
  const multiplier = currentAmount > 0 ? (payout / currentAmount).toFixed(2) : "—";

  // ── Live odds drift detection (Polymarket events only) ───────────────────
  const currentPrice = pick === "fighter_a" ? (fight.price_a ?? 0) : pick === "fighter_b" ? (fight.price_b ?? 0) : 0;
  const [baselinePrice, setBaselinePrice] = useState(currentPrice);
  const [showSmallChip, setShowSmallChip] = useState(false);
  const lastChipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset baseline when pick changes
  useEffect(() => {
    setBaselinePrice(currentPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  const drift = !isCustomEvent && baselinePrice > 0 && currentPrice > 0
    ? Math.abs(currentPrice - baselinePrice) / baselinePrice
    : 0;
  const quoteTier: "fresh" | "small" | "large" | "extreme" =
    drift >= 0.15 ? "extreme" : drift >= 0.05 ? "large" : drift > 0.001 ? "small" : "fresh";
  // Server requote takes priority over client-side drift
  const effectiveTier = requoteData ? "fresh" : quoteTier;

  // Briefly show "odds updated" chip on each small movement
  useEffect(() => {
    if (quoteTier === "small") {
      setShowSmallChip(true);
      if (lastChipTimer.current) clearTimeout(lastChipTimer.current);
      lastChipTimer.current = setTimeout(() => setShowSmallChip(false), 2000);
    }
    return () => { if (lastChipTimer.current) clearTimeout(lastChipTimer.current); };
  }, [currentPrice, quoteTier]);

  // Old payout using baseline price (for crossed-out display on large drift)
  const oldPayout = (() => {
    if (baselinePrice <= 0 || currentAmount <= 0) return payout;
    const fee = currentAmount * getFeeRate(fight);
    const net = currentAmount - fee;
    return net / baselinePrice;
  })();

  const handleSubmitWithBaselineSync = (amt: number) => {
    setBaselinePrice(currentPrice);
    onSubmit(amt);
  };

  // Success screen
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-md bg-[#0d1117] rounded-t-3xl sm:rounded-3xl p-8 text-center" onClick={e => e.stopPropagation()}>
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-bold text-white mb-2">{t("operator.modal.predictionPlaced")}</h2>
          <p className="text-white/60 text-sm mb-4">
            {t("operator.modal.youPicked", { name: pickedName })}
          </p>
          <div className="rounded-xl bg-white/5 p-4 mb-6">
            <p className="text-sm text-white/50">{t("operator.modal.ifTheyWin")}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: themeColor }}>
              ${(tradeResult?.net_amount_usdc ? calcPayout(fight, pick, tradeResult.net_amount_usdc + (tradeResult.fee_usdc ?? 0)) : payout).toFixed(2)}
            </p>
          </div>

          {onSharePick && (
            <button
              onClick={onSharePick}
              className="w-full py-3 rounded-xl font-bold text-white text-sm mb-3 flex items-center justify-center gap-2 transition-all"
              style={{ backgroundColor: themeColor }}
            >
              <Share2 className="w-4 h-4" /> {t("operator.modal.shareYourPick")}
            </button>
          )}

          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/60 text-sm font-medium transition-colors"
          >
            {t("operator.modal.done")}
          </button>
        </div>
      </div>
    );
  }

  // Extreme drift screen — block submission until user reviews
  if (effectiveTier === "extreme") {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-md bg-[#0d1117] rounded-t-3xl sm:rounded-3xl p-8 text-center" onClick={e => e.stopPropagation()}>
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">{t("operator.modal.marketMovedTitle")}</h2>
          <p className="text-white/60 text-sm mb-6">{t("operator.modal.marketMovedBody")}</p>
          <button
            onClick={() => setBaselinePrice(currentPrice)}
            className="w-full py-3 rounded-xl font-bold text-white text-sm mb-3 transition-all"
            style={{ backgroundColor: themeColor }}
          >
            {t("operator.modal.reviewUpdatedOdds")}
          </button>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/60 text-sm font-medium transition-colors"
          >
            {t("operator.modal.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d1117] rounded-t-3xl sm:rounded-3xl p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{t("operator.modal.placePrediction")}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Picked team */}
        <div className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-white/5">
          {logo && <img src={logo} className="w-10 h-10 object-contain" alt="" />}
          <div>
            <p className="text-xs text-white/40">{t("operator.modal.yourPick")}</p>
            <p className="text-lg font-bold text-white">{pickedName}</p>
          </div>
        </div>

        {/* Amount selection */}
        <div className="mb-4">
          <p className="text-sm text-white/50 mb-2">{t("operator.modal.enterAmount")}</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            {AMOUNTS.map(a => (
              <button
                key={a}
                onClick={() => { setAmount(a); setCustomAmount(""); }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border ${
                  !customAmount && amount === a
                    ? "text-white border-white/40 bg-white/10"
                    : "text-white/50 border-white/10 hover:border-white/20"
                }`}
              >
                ${a}
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="decimal"
            placeholder={t("operator.modal.customAmount")}
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg font-bold placeholder:text-white/20 focus:outline-none focus:border-white/30"
          />
        </div>

        {/* Live payout */}
        {currentAmount >= MIN_USD && (
          <div className="rounded-xl bg-white/5 p-4 mb-6 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/50 flex items-center gap-2">
                {t("operator.modal.predictReturn", { amount: currentAmount.toFixed(2) })}
                {effectiveTier === "small" && showSmallChip && (
                  <span className="text-[10px] text-amber-400 font-semibold animate-pulse">⟳ {t("operator.modal.oddsUpdated")}</span>
                )}
              </span>
              <span className="font-bold text-lg flex items-center gap-2">
                {effectiveTier === "large" && (
                  <span className="text-white/40 line-through text-sm">${oldPayout.toFixed(2)}</span>
                )}
                <span style={{ color: themeColor }}>${payout.toFixed(2)}</span>
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">{t("operator.modal.profit")}</span>
              <span className="text-green-400 font-bold">+${profit.toFixed(2)} ({multiplier}x)</span>
            </div>
          </div>
        )}

        {/* Approval indicator */}
        {approvalStep && approvalStep !== "idle" && (
          <div className="mb-4">
            <ApprovalStepIndicator step={approvalStep} errorReason={approvalError} />
          </div>
        )}

        {/* Requote banner — odds changed */}
        {requoteData && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-sm font-bold text-white">{t("operator.modal.oddsChanged")}</p>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">{t("operator.modal.previousOdds")}</span>
              <span className="text-white/60 line-through">{((1 / requoteData.old_price) * 100).toFixed(0)}% → ${(currentAmount / requoteData.old_price).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">{t("operator.modal.newOdds")}</span>
              <span className="font-bold" style={{ color: themeColor }}>{((1 / requoteData.new_price) * 100).toFixed(0)}% → ${requoteData.updated_payout.toFixed(2)}</span>
            </div>
            <button
              onClick={() => { onAcceptRequote?.(); onSubmit(currentAmount); }}
              disabled={submitting}
              className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all"
              style={{ backgroundColor: themeColor }}
            >
              <RefreshCw className="w-4 h-4" /> {t("operator.modal.acceptNewOdds")}
            </button>
          </div>
        )}

        {/* Custom event finality notice + pool */}
        {isCustomEvent && (
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-4 text-center space-y-1">
            <p className="text-sm font-bold text-white/80">
              💰 {t("operator.modal.totalPool", { amount: ((fight.pool_a_usd ?? 0) + (fight.pool_b_usd ?? 0)).toFixed(2) })}
            </p>
            <p className="text-xs text-white/60">🔒 {t("operator.modal.predictionsFinal")}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={() => currentAmount >= MIN_USD && onSubmit(currentAmount)}
          disabled={submitting || currentAmount < MIN_USD}
          className="w-full py-4 rounded-xl font-bold text-lg text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: submitting ? undefined : themeColor }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> {t("operator.modal.processing")}
            </span>
          ) : currentAmount < MIN_USD ? (
            t("operator.modal.enterMinAmount", { min: MIN_USD })
          ) : (
            t("operator.modal.placePredictionAmount", { amount: currentAmount.toFixed(2) })
          )}
        </button>

        <p className="text-center text-[10px] text-white/15 mt-3">
          {t("operator.modal.serviceFee")} • {operatorBrandName || "1MG"}
        </p>
      </div>
    </div>
  );
}
