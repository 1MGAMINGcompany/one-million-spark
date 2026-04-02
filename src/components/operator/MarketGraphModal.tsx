import { X, TrendingUp, BarChart3, DollarSign, Activity } from "lucide-react";
import type { Fight } from "@/components/predictions/FightCard";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import type { OperatorTheme } from "@/lib/operatorThemes";

interface MarketGraphModalProps {
  fight: Fight;
  open: boolean;
  onClose: () => void;
  theme: OperatorTheme;
}

export default function MarketGraphModal({ fight, open, onClose, theme }: MarketGraphModalProps) {
  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);

  const priceA = fight.price_a ?? 0.5;
  const priceB = fight.price_b ?? 0.5;

  const volume = (fight as any).polymarket_volume_usd || 0;
  const volume24h = (fight as any).polymarket_volume_24h || 0;
  const liquidity = (fight as any).polymarket_liquidity || 0;

  if (!open) return null;

  const overlayBg = theme.isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)";
  const modalBg = theme.isDark ? "#141414" : "#ffffff";
  const borderColor = theme.isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0";

  const StatCard = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
    <div
      className="rounded-xl p-3 text-center"
      style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
    >
      <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: theme.textMuted }} />
      <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: theme.textMuted }}>
        {label}
      </p>
      <p className="text-sm font-bold" style={{ color: theme.textPrimary }}>{value}</p>
    </div>
  );

  const fmtUsd = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K`
    : `$${v.toFixed(0)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: overlayBg }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: modalBg, border: `1px solid ${borderColor}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" style={{ color: theme.primary }} />
            <h3 className="font-bold text-base" style={{ color: theme.textPrimary }}>
              Market Stats
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70 transition-opacity">
            <X className="w-5 h-5" style={{ color: theme.textMuted }} />
          </button>
        </div>

        {/* Event title */}
        <p className="text-sm font-medium mb-1" style={{ color: theme.textPrimary }}>
          {nameA} vs {nameB}
        </p>
        <p className="text-xs mb-4" style={{ color: theme.textMuted }}>
          {fight.event_name}
        </p>

        {/* Current odds */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
          >
            <p className="text-xs mb-1 font-medium" style={{ color: theme.textMuted }}>{nameA}</p>
            <p className="text-3xl font-black" style={{ color: theme.primary }}>
              {Math.round(priceA * 100)}%
            </p>
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              {priceA > 0 ? `${(1 / priceA).toFixed(2)}x payout` : "—"}
            </p>
          </div>
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
          >
            <p className="text-xs mb-1 font-medium" style={{ color: theme.textMuted }}>{nameB}</p>
            <p className="text-3xl font-black" style={{ color: theme.textSecondary }}>
              {Math.round(priceB * 100)}%
            </p>
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              {priceB > 0 ? `${(1 / priceB).toFixed(2)}x payout` : "—"}
            </p>
          </div>
        </div>

        {/* Probability bar */}
        <div className="mb-4">
          <div className="h-3 rounded-full overflow-hidden flex" style={{ backgroundColor: theme.surfaceBg }}>
            <div
              className="h-full rounded-l-full transition-all duration-500"
              style={{ width: `${Math.round(priceA * 100)}%`, backgroundColor: theme.primary }}
            />
            <div
              className="h-full rounded-r-full transition-all duration-500"
              style={{
                width: `${Math.round(priceB * 100)}%`,
                backgroundColor: theme.isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1",
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] font-medium" style={{ color: theme.primary }}>{nameA}</span>
            <span className="text-[10px] font-medium" style={{ color: theme.textMuted }}>{nameB}</span>
          </div>
        </div>

        {/* Market stats grid */}
        {(volume > 0 || volume24h > 0 || liquidity > 0) && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {volume > 0 && <StatCard icon={DollarSign} label="Volume" value={fmtUsd(volume)} />}
            {volume24h > 0 && <StatCard icon={Activity} label="24h Vol" value={fmtUsd(volume24h)} />}
            {liquidity > 0 && <StatCard icon={BarChart3} label="Liquidity" value={fmtUsd(liquidity)} />}
          </div>
        )}

        {/* Source badge */}
        {fight.source === "polymarket" && (
          <p className="text-[10px] text-center" style={{ color: theme.textMuted }}>
            Odds powered by live market data
          </p>
        )}
      </div>
    </div>
  );
}
