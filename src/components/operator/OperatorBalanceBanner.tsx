import { DollarSign, PlusCircle } from "lucide-react";
import type { OperatorTheme } from "@/lib/operatorThemes";

interface OperatorBalanceBannerProps {
  balanceUsdce: number | null | undefined;
  theme: OperatorTheme;
  onAddFunds?: () => void;
}

export default function OperatorBalanceBanner({ balanceUsdce, theme, onAddFunds }: OperatorBalanceBannerProps) {
  if (balanceUsdce == null) return null;

  const low = balanceUsdce < 5;

  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-xs"
      style={{
        backgroundColor: low
          ? (theme.isDark ? "rgba(120,53,15,0.2)" : "rgba(254,243,199,0.6)")
          : theme.surfaceBg,
        borderBottom: `1px solid ${low ? (theme.isDark ? "rgba(245,158,11,0.2)" : "#fde68a") : theme.cardBorder}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5" style={{ color: theme.textMuted }} />
        <span style={{ color: theme.textSecondary }}>Balance:</span>
        <span className="font-bold" style={{ color: low ? "#f59e0b" : theme.textPrimary }}>
          ${balanceUsdce.toFixed(2)}
        </span>
      </div>
      {low && (
        <button
          onClick={onAddFunds}
          className="flex items-center gap-1 text-xs font-bold transition-colors hover:opacity-80"
          style={{ color: theme.primary }}
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add Funds
        </button>
      )}
    </div>
  );
}
