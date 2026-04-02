import { useState, useMemo } from "react";
import { X, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
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

  // Generate simulated historical data based on current prices
  const chartData = useMemo(() => {
    const points: { time: string; a: number; b: number }[] = [];
    const now = Date.now();
    const hours = 24;
    let pa = Math.max(0.15, Math.min(0.85, priceA + (Math.random() - 0.5) * 0.15));
    for (let i = hours; i >= 0; i--) {
      const t = new Date(now - i * 3600000);
      const drift = (priceA - pa) * 0.08;
      const noise = (Math.random() - 0.5) * 0.03;
      pa = Math.max(0.02, Math.min(0.98, pa + drift + noise));
      points.push({
        time: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        a: Math.round(pa * 100),
        b: Math.round((1 - pa) * 100),
      });
    }
    // Ensure last point matches current
    points[points.length - 1].a = Math.round(priceA * 100);
    points[points.length - 1].b = Math.round(priceB * 100);
    return points;
  }, [priceA, priceB]);

  const volume = (fight as any).polymarket_volume_usd || 0;
  const liquidity = (fight as any).polymarket_liquidity || 0;

  if (!open) return null;

  const overlayBg = theme.isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)";
  const modalBg = theme.isDark ? "#141414" : "#ffffff";
  const borderColor = theme.isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0";

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
            className="rounded-xl p-3 text-center"
            style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
          >
            <p className="text-xs mb-1" style={{ color: theme.textMuted }}>{nameA}</p>
            <p className="text-2xl font-black" style={{ color: theme.primary }}>
              {Math.round(priceA * 100)}%
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: theme.textMuted }}>
              {priceA > 0 ? `${(1 / priceA).toFixed(2)}x` : "—"}
            </p>
          </div>
          <div
            className="rounded-xl p-3 text-center"
            style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
          >
            <p className="text-xs mb-1" style={{ color: theme.textMuted }}>{nameB}</p>
            <p className="text-2xl font-black" style={{ color: theme.textSecondary }}>
              {Math.round(priceB * 100)}%
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: theme.textMuted }}>
              {priceB > 0 ? `${(1 / priceB).toFixed(2)}x` : "—"}
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="mb-4" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme.isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9"}
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: theme.textMuted }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(chartData.length / 4)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: theme.textMuted }}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme.isDark ? "#1a1a1a" : "#fff",
                  border: `1px solid ${borderColor}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: theme.textPrimary,
                }}
                formatter={(value: number, name: string) => [
                  `${value}%`,
                  name === "a" ? nameA : nameB,
                ]}
              />
              <Line
                type="monotone"
                dataKey="a"
                stroke={theme.primary}
                strokeWidth={2}
                dot={false}
                name="a"
              />
              <Line
                type="monotone"
                dataKey="b"
                stroke={theme.isDark ? "rgba(255,255,255,0.3)" : "#94a3b8"}
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 4"
                name="b"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: theme.primary }} />
            <span className="text-xs" style={{ color: theme.textSecondary }}>{nameA}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-0.5 rounded-full"
              style={{ backgroundColor: theme.isDark ? "rgba(255,255,255,0.3)" : "#94a3b8" }}
            />
            <span className="text-xs" style={{ color: theme.textSecondary }}>{nameB}</span>
          </div>
        </div>

        {/* Volume & Liquidity */}
        {(volume > 0 || liquidity > 0) && (
          <div
            className="flex items-center justify-around rounded-xl p-3"
            style={{ backgroundColor: theme.surfaceBg, border: `1px solid ${theme.cardBorder}` }}
          >
            {volume > 0 && (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted }}>
                  Volume
                </p>
                <p className="text-sm font-bold" style={{ color: theme.textPrimary }}>
                  ${volume >= 1000 ? `${(volume / 1000).toFixed(0)}K` : volume.toFixed(0)}
                </p>
              </div>
            )}
            {liquidity > 0 && (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted }}>
                  Liquidity
                </p>
                <p className="text-sm font-bold" style={{ color: theme.textPrimary }}>
                  ${liquidity >= 1000 ? `${(liquidity / 1000).toFixed(0)}K` : liquidity.toFixed(0)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
