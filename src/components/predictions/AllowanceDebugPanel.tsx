import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bug, RefreshCw, Loader2 } from "lucide-react";
import { usePolygonUSDC, FEE_RELAYER_ADDRESS } from "@/hooks/usePolygonUSDC";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { isDebugEnabled } from "@/lib/debugLog";

const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

function padAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

async function fetchLiveAllowance(owner: string): Promise<number | null> {
  const callData = "0xdd62ed3e" + padAddress(owner) + padAddress(FEE_RELAYER_ADDRESS);
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: USDC_CONTRACT, data: callData }, "latest"],
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.result) return Number(BigInt(json.result)) / 1e6;
    } catch { continue; }
  }
  return null;
}

export default function AllowanceDebugPanel() {
  const { walletAddress } = usePrivyWallet();
  const { relayer_allowance, usdc_balance } = usePolygonUSDC();
  const [liveAllowance, setLiveAllowance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Only show in debug mode
  if (!isDebugEnabled()) return null;

  const handleCheck = async () => {
    if (!walletAddress) return;
    setLoading(true);
    const val = await fetchLiveAllowance(walletAddress);
    setLiveAllowance(val);
    setLoading(false);
    console.log("[AllowanceDebug]", {
      owner: walletAddress,
      relayer: FEE_RELAYER_ADDRESS,
      token: USDC_CONTRACT,
      cachedAllowance: relayer_allowance,
      liveAllowance: val,
      balance: usdc_balance,
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-50 bg-secondary/80 border border-border rounded-full p-2 hover:bg-secondary"
        title="Check Fee Approval"
      >
        <Bug className="w-4 h-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-card border border-border rounded-lg p-4 shadow-lg max-w-xs text-xs space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-foreground text-sm">Fee Approval Debug</span>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
      </div>

      <div className="space-y-1">
        <Row label="Wallet" value={walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}` : "—"} />
        <Row label="Relayer" value={`${FEE_RELAYER_ADDRESS.slice(0, 8)}…${FEE_RELAYER_ADDRESS.slice(-6)}`} />
        <Row label="USDC Balance" value={usdc_balance != null ? `$${usdc_balance.toFixed(2)}` : "—"} />
        <Row label="Cached Allowance" value={relayer_allowance != null ? `$${relayer_allowance.toFixed(2)}` : "—"} />
        {liveAllowance !== null && (
          <Row label="Live Allowance" value={`$${liveAllowance.toFixed(2)}`} highlight />
        )}
        <Row
          label="Approval Needed?"
          value={(relayer_allowance ?? 0) < 1 ? "YES" : "NO"}
          highlight={(relayer_allowance ?? 0) < 1}
        />
      </div>

      <Button size="sm" variant="secondary" className="w-full gap-1.5 mt-2" onClick={handleCheck} disabled={loading || !walletAddress}>
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        Check Fee Approval
      </Button>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${highlight ? "text-primary font-bold" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
