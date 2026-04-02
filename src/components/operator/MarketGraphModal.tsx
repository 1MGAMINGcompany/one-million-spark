import { useState, useMemo } from "react";
import { X, TrendingUp, BarChart3, DollarSign, Activity } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import type { Fight } from "@/components/predictions/FightCard";
import { resolveOutcomeName } from "@/lib/resolveOutcomeName";
import type { OperatorTheme } from "@/lib/operatorThemes";
import { usePolymarketHistory } from "@/hooks/usePolymarketHistory";

type Interval = "1h" | "6h" | "1d" | "1w" | "all";

const INTERVALS: { label: string; value: Interval }[] = [
  { label: "1H", value: "1h" },
  { label: "6H", value: "6h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "ALL", value: "all" },
];

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

  const tokenA: string | null = (fight as any).polymarket_outcome_a_token || null;
  const tokenB: string | null = (fight as any).polymarket_outcome_b_token || null;

  const [interval, setInterval] = useState<Interval>("1d");
  const [selectedSide, setSelectedSide] = useState<"a" | "b">("a");

  const activeToken = selectedSide === "a" ? tokenA : tokenB;
  const hasTokens = !!(tokenA || tokenB);

  const { history, loading, error } = usePolymarketHistory(activeToken, interval, open && hasTokens);

  const chartData = useMemo(() => {
    if (!history.length) return [];
    return history.map((pt) => ({
      time: pt.t * 1000,
      price: pt.p,
      pct: Math.round(pt.p * 100),
    }));
  }, [history]);

  if (!open) return null;

  const overlayBg = theme.isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)";
  const modalBg = theme.isDark ? "#141414" : "#ffffff";
  const borderColor = theme.isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0";
  const gridStroke = theme.isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9";

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    if (interval === "1h" || interval === "6h") {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (interval === "1d") {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const fmtUsd = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K`
    : `$${v.toFixed(0)}`;

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

  const activeName = selectedSide === "a" ? nameA : nameB;
  const activePrice = selectedSide === "a" ? priceA : priceB;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: overlayBg }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: modalBg, border: `1px solid ${borderColor}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" style={{ color: theme.primary }} />
            <h3 className="font-bold text-base" style={{ color: theme.textPrimary }}>
              Market Chart
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70 transition-opacity">
            <X className="w-5 h-5" style={{ color: theme.textMuted }} />
          </button>
        </div>

        {/* Event title */}
        <p className="text-sm font-medium mb-0.5" style={{ color: theme.textPrimary }}>
          {nameA} vs {nameB}
        </p>
        <p className="text-xs mb-3" style={{ color: theme.textMuted }}>
          {fight.event_name}
        </p>

        {/* Side toggle */}
        {hasTokens && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setSelectedSide("a")}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
              style={{
                backgroundColor: selectedSide === "a" ? theme.primary : theme.surfaceBg,
                color: selectedSide === "a" ? theme.primaryForeground : theme.textSecondary,
                border: `1px solid ${selectedSide === "a" ? theme.primary : theme.cardBorder}`,
              }}
            >
              {nameA} — {Math.round(priceA * 100)}%
            </button>
            <button
              onClick={() => setSelectedSide("b")}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
              style={{
                backgroundColor: selectedSide === "b" ? theme.primary : theme.surfaceBg,
                color: selectedSide === "b" ? theme.primaryForeground : theme.textSecondary,
                border: `1px solid ${selectedSide === "b" ? theme.primary : theme.cardBorder}`,
              }}
            >
              {nameB} — {Math.round(priceB * 100)}%
            </button>
          </div>
        )}

        {/* Interval selector */}
        {hasTokens && (
          <div className="flex gap-1 mb-3">
            {INTERVALS.map((iv) => (
              <button
                key={iv.value}
                onClick={() => setInterval(iv.value)}
                className="flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all"
                style={{
                  backgroundColor: interval === iv.value ? theme.primary : theme.surfaceBg,
                  color: interval === iv.value ? theme.primaryForeground : theme.textMuted,
                }}
              >
                {iv.label}
              </button>
            ))}
          </div>
        )}

        {/* Chart area */}
        {hasTokens && (
          <div className="mb-4">
            {loading && (
              <div
                className="h-[180px] rounded-xl flex items-center justify-center"
                style={{ backgroundColor: theme.surfaceBg }}
              >
                <p className="text-xs animate-pulse" style={{ color: theme.textMuted }}>Loading chart…</p>
              </div>
            )}
            {!loading && error && (
              <div
                className="h-[180px] rounded-xl flex items-center justify-center"
                style={{ backgroundColor: theme.surfaceBg }}
              >
                <p className="text-xs" style={{ color: theme.textMuted }}>Chart unavailable</p>
              </div>
            )}
            {!loading && !error && chartData.length === 0 && (
              <div
                className="h-[180px] rounded-xl flex items-center justify-center"
                style={{ backgroundColor: theme.surfaceBg }}
              >
                <p className="text-xs" style={{ color: theme.textMuted }}>No history for this range</p>
              </div>
            )}
            {!loading && !error && chartData.length > 0 && (
              <div className="rounded-xl p-2" style={{ backgroundColor: theme.surfaceBg }}>
                <div className="flex items-baseline gap-2 mb-1 px-1">
                  <span className="text-lg font-black" style={{ color: theme.primary }}>
                    {Math.round(activePrice * 100)}%
                  </span>
                  <span className="text-[10px]" style={{ color: theme.textMuted }}>
                    {activeName}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.primary} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={theme.primary} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="time"
                      tickFormatter={fmtTime}
                      tick={{ fontSize: 9, fill: theme.textMuted }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={30}
                    />
                    <YAxis
                      domain={[0, 1]}
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 9, fill: theme.textMuted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: modalBg,
                        border: `1px solid ${borderColor}`,
                        borderRadius: 8,
                        fontSize: 11,
                        color: theme.textPrimary,
                      }}
                      labelFormatter={(ts: number) => new Date(ts).toLocaleString()}
                      formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, activeName]}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={theme.primary}
                      strokeWidth={2}
                      fill="url(#priceGradient)"
                      dot={false}
                      activeDot={{ r: 3, fill: theme.primary }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

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
            Powered by live Polymarket data
          </p>
        )}

        {/* No-token fallback note */}
        {!hasTokens && (
          <p className="text-[10px] text-center" style={{ color: theme.textMuted }}>
            Historical chart unavailable for this event
          </p>
        )}
      </div>
    </div>
  );
}
