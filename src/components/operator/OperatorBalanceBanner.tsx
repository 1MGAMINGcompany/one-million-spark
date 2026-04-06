import { useState, useEffect, useCallback } from "react";
import { DollarSign, PlusCircle } from "lucide-react";
import type { OperatorTheme } from "@/lib/operatorThemes";

const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const BALANCE_OF_SELECTOR = "0x70a08231";
const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

function padAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

async function fetchUsdcBalance(walletAddress: string): Promise<number | null> {
  const callData = BALANCE_OF_SELECTOR + padAddress(walletAddress);
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to: USDC_CONTRACT, data: callData }, "latest"],
  });
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error || !json.result) continue;
      return Number(BigInt(json.result)) / 1e6;
    } catch { continue; }
  }
  return null;
}

interface OperatorBalanceBannerProps {
  balanceUsdce: number | null | undefined;
  eoaAddress?: string | null;
  theme: OperatorTheme;
  onAddFunds?: () => void;
}

export default function OperatorBalanceBanner({ balanceUsdce, eoaAddress, theme, onAddFunds }: OperatorBalanceBannerProps) {
  const [eoaBalance, setEoaBalance] = useState<number | null>(null);

  const fetchEoa = useCallback(async () => {
    if (!eoaAddress) return;
    const bal = await fetchUsdcBalance(eoaAddress);
    setEoaBalance(bal);
  }, [eoaAddress]);

  useEffect(() => {
    fetchEoa();
    const id = setInterval(fetchEoa, 15_000);
    return () => clearInterval(id);
  }, [fetchEoa]);

  // Combined balance: smart wallet (from usePolygonUSDC) + EOA if different
  const smartBal = balanceUsdce ?? 0;
  const combinedBalance = smartBal + (eoaBalance ?? 0);

  if (balanceUsdce == null && eoaBalance == null) return null;

  const low = combinedBalance < 5;

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
          ${combinedBalance.toFixed(2)}
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
