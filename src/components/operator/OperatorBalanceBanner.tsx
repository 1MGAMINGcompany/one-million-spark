import { DollarSign, PlusCircle } from "lucide-react";

interface OperatorBalanceBannerProps {
  balanceUsdce: number | null | undefined;
  themeColor?: string;
  onAddFunds?: () => void;
}

export default function OperatorBalanceBanner({ balanceUsdce, themeColor = "#3b82f6", onAddFunds }: OperatorBalanceBannerProps) {
  if (balanceUsdce == null) return null;

  const low = balanceUsdce < 5;

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-xs ${low ? "bg-amber-900/20 border-b border-amber-500/20" : "bg-white/[0.02] border-b border-white/5"}`}>
      <div className="flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5 text-white/40" />
        <span className="text-white/50">Balance:</span>
        <span className={`font-bold ${low ? "text-amber-400" : "text-white/70"}`}>
          ${balanceUsdce.toFixed(2)}
        </span>
      </div>
      {low && (
        <button
          onClick={onAddFunds}
          className="flex items-center gap-1 text-xs font-bold transition-colors hover:opacity-80"
          style={{ color: themeColor }}
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add Funds
        </button>
      )}
    </div>
  );
}
