import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Lightbulb, TrendingUp, Activity, Wallet, Brain, Loader2, HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import { buildSmartMoneySummary } from "@/lib/smart-money";
import type { Fight } from "@/components/predictions/FightCard";
import type { OperatorTheme } from "@/lib/operatorThemes";
import { hasSeenTutorial, resetTutorial } from "./SmartPlayTutorial";

interface MarketTipsModalProps {
  fight: Fight | null;
  open: boolean;
  onClose: () => void;
  theme: OperatorTheme;
  onShowTutorial?: () => void;
}

export default function MarketTipsModal({ fight, open, onClose, theme, onShowTutorial }: MarketTipsModalProps) {
  const { t, i18n } = useTranslation();

  const nameA = fight ? resolveOutcomeName(fight.fighter_a_name, "a", fight) : "";
  const nameB = fight ? resolveOutcomeName(fight.fighter_b_name, "b", fight) : "";

  const pA = fight?.price_a ?? 0;
  const pB = fight?.price_b ?? 0;
  const poolAUsd = fight?.pool_a_usd ?? 0;
  const poolBUsd = fight?.pool_b_usd ?? 0;
  const volume = (fight as any)?.polymarket_volume_usd ?? 0;
  const liquidity = (fight as any)?.polymarket_liquidity ?? 0;

  const isCustomEvent = !!(fight as any)?.operator_id && !(fight as any)?.polymarket_slug;

  // Build tactic cards from i18n keys
  const importedTactics = useMemo(() => [
    { emoji: "⚡", title: t("smartPlay.importedTactic1Title"), desc: t("smartPlay.importedTactic1Desc") },
    { emoji: "💰", title: t("smartPlay.importedTactic2Title"), desc: t("smartPlay.importedTactic2Desc") },
    { emoji: "🛡️", title: t("smartPlay.importedTactic3Title"), desc: t("smartPlay.importedTactic3Desc") },
    { emoji: "⏳", title: t("smartPlay.importedTactic4Title"), desc: t("smartPlay.importedTactic4Desc") },
    { emoji: "🧠", title: t("smartPlay.importedTactic5Title"), desc: t("smartPlay.importedTactic5Desc") },
  ], [t]);

  const customTactics = useMemo(() => [
    { emoji: "📋", title: t("smartPlay.customTactic1Title"), desc: t("smartPlay.customTactic1Desc") },
    { emoji: "🔒", title: t("smartPlay.customTactic2Title"), desc: t("smartPlay.customTactic2Desc") },
    { emoji: "🎯", title: t("smartPlay.customTactic3Title"), desc: t("smartPlay.customTactic3Desc") },
    { emoji: "⏳", title: t("smartPlay.customTactic4Title"), desc: t("smartPlay.customTactic4Desc") },
    { emoji: "📖", title: t("smartPlay.customTactic5Title"), desc: t("smartPlay.customTactic5Desc") },
  ], [t]);

  const tactics = isCustomEvent ? customTactics : importedTactics;

  const smartMoney = useMemo(() => buildSmartMoneySummary({
    priceA: pA,
    priceB: pB,
    poolAUsd,
    poolBUsd,
    totalVolume: volume,
  }), [pA, pB, poolAUsd, poolBUsd, volume]);

  // AI insight query
  const { data: aiInsight, isLoading: aiLoading } = useQuery({
    queryKey: ["tips-insight", fight?.id, i18n.language],
    queryFn: async () => {
      if (!fight) return null;
      const { data, error } = await supabase.functions.invoke("prediction-ai-insight", {
        body: {
          mode: "tips",
          lang: i18n.language,
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
    enabled: open && !!fight && !isCustomEvent,
  });

  if (!open || !fight) return null;

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
            <h3 className="text-base font-bold" style={{ color: theme.textPrimary }}>{t("smartPlay.title")}</h3>
          </div>
          <div className="flex items-center gap-1">
            {onShowTutorial && (
              <button onClick={onShowTutorial} className="p-1 rounded-full hover:opacity-70 transition-opacity" title={t("smartPlay.howItWorks")}>
                <HelpCircle className="w-4 h-4" style={{ color: theme.textMuted }} />
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-full hover:opacity-70 transition-opacity">
              <X className="w-4 h-4" style={{ color: theme.textMuted }} />
            </button>
          </div>
        </div>

        {/* Helper line */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[11px] text-center" style={{ color: theme.textMuted }}>
            {t("smartPlay.helperText")}
          </p>
        </div>

        {/* Event header */}
        <div className="px-4 pt-1 pb-2 text-center">
          <p className="text-sm font-bold" style={{ color: theme.textPrimary }}>
            {nameA} vs {nameB}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: theme.textMuted }}>
            {fight.event_name}
          </p>
        </div>

        {/* Smart Money signals — only for imported events with data */}
        {!isCustomEvent && (
          <div className="px-4 py-3 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
              {t("marketTips.bigPlayerActivity")}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Activity, label: t("marketTips.activity"), value: smartMoney.activity },
                { icon: TrendingUp, label: t("marketTips.momentum"), value: smartMoney.momentum },
                { icon: Wallet, label: t("marketTips.largeTrades"), value: smartMoney.whaleSignal },
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
            <div className="rounded-xl p-3" style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                💡 {smartMoney.quickRead}
              </p>
            </div>
          </div>
        )}

        {/* Tactic Cards */}
        <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
          <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
            {isCustomEvent ? t("smartPlay.eventPlaybook") : t("smartPlay.tacticsTitle")}
          </h4>
          <div className="space-y-1.5">
            {tactics.map((tac, i) => (
              <div
                key={i}
                className="rounded-xl p-3 flex items-start gap-2.5"
                style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
              >
                <span className="text-base shrink-0 mt-0.5">{tac.emoji}</span>
                <div>
                  <p className="text-xs font-bold" style={{ color: theme.textPrimary }}>{tac.title}</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: theme.textSecondary }}>{tac.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Analysis — only for imported events */}
        {!isCustomEvent && (
          <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" style={{ color: theme.primary }} />
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                {t("marketTips.aiAnalysis")}
              </h4>
            </div>

            {aiLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.primary }} />
                <span className="text-xs ml-2" style={{ color: theme.textMuted }}>{t("marketTips.analyzingMarket")}</span>
              </div>
            ) : aiInsight && !aiInsight.fallback ? (
              <div className="space-y-2">
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
                <div className="rounded-xl p-3" style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}>
                  <p className="text-xs leading-relaxed" style={{ color: theme.textPrimary }}>
                    {aiInsight.summary}
                  </p>
                </div>
                {aiInsight.bigWalletInsight && (
                  <div className="rounded-xl p-3" style={{ backgroundColor: theme.primary + "08", border: `1px solid ${theme.primary}22` }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: theme.primary }}>
                      🐋 {t("marketTips.bigWalletLeaning")}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
                      {aiInsight.bigWalletInsight}
                    </p>
                  </div>
                )}
                {aiInsight.caution && (
                  <p className="text-[10px] italic" style={{ color: theme.textMuted }}>
                    ⚠️ {aiInsight.caution}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: theme.surfaceBg }}>
                <p className="text-xs" style={{ color: theme.textMuted }}>
                  {t("marketTips.aiUnavailable")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Key difference line — context-sensitive */}
        <div className="px-4 py-3 text-center" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
          {(fight as any)?.polymarket_market_id ? (
            <p className="text-[11px] font-medium" style={{ color: theme.primary }}>
              💡 {t("smartPlay.sellFooter")}
            </p>
          ) : (
            <p className="text-[11px] font-medium" style={{ color: theme.primary }}>
              🔒 {t("smartPlay.customFooter")}
            </p>
          )}
          <p className="text-[10px] mt-1" style={{ color: theme.textMuted }}>
            {t("marketTips.poweredBy")}
          </p>
        </div>
      </div>
    </div>
  );
}
