import { useState, useEffect, useMemo } from "react";
import { X, Lightbulb, TrendingUp, Activity, Wallet, Brain, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import { buildSmartMoneySummary } from "@/lib/smart-money";
import type { Fight } from "@/components/predictions/FightCard";
import type { OperatorTheme } from "@/lib/operatorThemes";

interface MarketTipsModalProps {
  fight: Fight | null;
  open: boolean;
  onClose: () => void;
  theme: OperatorTheme;
}

export default function MarketTipsModal({ fight, open, onClose, theme }: MarketTipsModalProps) {
  if (!open || !fight) return null;

  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);

  const pA = fight.price_a ?? 0;
  const pB = fight.price_b ?? 0;
  const poolAUsd = fight.pool_a_usd ?? 0;
  const poolBUsd = fight.pool_b_usd ?? 0;
  const volume = (fight as any).polymarket_volume_usd ?? 0;
  const liquidity = (fight as any).polymarket_liquidity ?? 0;

  const smartMoney = useMemo(() => buildSmartMoneySummary({
    priceA: pA,
    priceB: pB,
    poolAUsd,
    poolBUsd,
    totalVolume: volume,
  }), [pA, pB, poolAUsd, poolBUsd, volume]);

  // AI insight query
  const { data: aiInsight, isLoading: aiLoading } = useQuery({
    queryKey: ["tips-insight", fight.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("prediction-ai-insight", {
        body: {
          mode: "tips",
          title: fight.event_name,
          sport: (fight as any)._broadSport || "",
          sideA: nameA,
          sideB: nameB,
          probabilityA: pA,
          probabilityB: pB,
          volume,
          liquidity,
          trend: smartMoney.momentum,
          signals: [smartMoney.activity, smartMoney.whaleSignal].filter(s => s !== "Normal Activity" && s !== "No Unusual Entries"),
        },
      });
      if (error) return null;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const signalColor = (label: string) => {
    if (label.includes("Unusual") || label.includes("Large") || label.includes("Multiple") || label.includes("Building"))
      return theme.primary;
    return theme.textSecondary;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2" style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5" style={{ color: theme.primary }} />
            <h3 className="text-base font-bold" style={{ color: theme.textPrimary }}>Tips</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:opacity-70 transition-opacity">
            <X className="w-4 h-4" style={{ color: theme.textMuted }} />
          </button>
        </div>

        {/* Event header */}
        <div className="px-4 pt-3 pb-2 text-center">
          <p className="text-sm font-bold" style={{ color: theme.textPrimary }}>
            {nameA} vs {nameB}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: theme.textMuted }}>
            {fight.event_name}
          </p>
        </div>

        {/* Smart Money signals */}
        <div className="px-4 py-3 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
            Big Player Activity
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Activity, label: "Activity", value: smartMoney.activity },
              { icon: TrendingUp, label: "Momentum", value: smartMoney.momentum },
              { icon: Wallet, label: "Large Trades", value: smartMoney.whaleSignal },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl p-3 text-center"
                style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
              >
                <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: signalColor(value) }} />
                <p className="text-[9px] font-medium uppercase" style={{ color: theme.textMuted }}>{label}</p>
                <p className="text-[11px] font-bold mt-0.5" style={{ color: signalColor(value) }}>{value}</p>
              </div>
            ))}
          </div>
          {/* Quick read */}
          <div className="rounded-xl p-3" style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}>
            <p className="text-xs" style={{ color: theme.textSecondary }}>
              💡 {smartMoney.quickRead}
            </p>
          </div>
        </div>

        {/* AI Analysis */}
        <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4" style={{ color: theme.primary }} />
            <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
              AI Analysis
            </h4>
          </div>

          {aiLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.primary }} />
              <span className="text-xs ml-2" style={{ color: theme.textMuted }}>Analyzing market...</span>
            </div>
          ) : aiInsight && !aiInsight.fallback ? (
            <div className="space-y-2">
              {/* Confidence label */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: theme.primary + "22", color: theme.primary }}
                >
                  {aiInsight.confidenceLabel}
                </span>
                {aiInsight.signalTags?.map((tag: string) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: theme.surfaceBg, color: theme.textSecondary, border: `1px solid ${theme.cardBorder}` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Summary */}
              <div className="rounded-xl p-3" style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}>
                <p className="text-xs leading-relaxed" style={{ color: theme.textPrimary }}>
                  {aiInsight.summary}
                </p>
              </div>

              {/* Big wallet chat */}
              {aiInsight.bigWalletInsight && (
                <div className="rounded-xl p-3" style={{ backgroundColor: theme.primary + "08", border: `1px solid ${theme.primary}22` }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: theme.primary }}>
                    🐋 Where Big Wallets Are Leaning
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
                    {aiInsight.bigWalletInsight}
                  </p>
                </div>
              )}

              {/* Caution */}
              {aiInsight.caution && (
                <p className="text-[10px] italic" style={{ color: theme.textMuted }}>
                  ⚠️ {aiInsight.caution}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: theme.surfaceBg }}>
              <p className="text-xs" style={{ color: theme.textMuted }}>
                AI analysis is temporarily unavailable. Use the Big Player Activity signals above.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 text-center" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
          <p className="text-[10px]" style={{ color: theme.textMuted }}>
            Powered by 1mg.live
          </p>
        </div>
      </div>
    </div>
  );
}
