import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Wallet, ExternalLink, Check, AlertTriangle, RefreshCw,
  ArrowUpRight, Clock, CheckCircle2, XCircle, Copy, DollarSign,
} from "lucide-react";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { CashOutModal } from "@/components/CashOutModal";

interface SweepRecord {
  id: string;
  operator_fee_usdc: number;
  sweep_status: string;
  sweep_tx_hash: string | null;
  sweep_destination_wallet: string | null;
  sweep_attempted_at: string | null;
  sweep_completed_at: string | null;
  sweep_error: string | null;
  created_at: string;
}

interface SweepSummary {
  payout_wallet: string | null;
  payout_wallet_balance: number | null;
  total_earned: number;
  total_swept: number;
  pending_sweep: number;
  failed_sweep: number;
  accrued: number;
  sweeps: SweepRecord[];
}

interface Props {
  operatorId: string;
  getAccessToken: () => Promise<string | null>;
}

export default function OperatorEarningsTab({ operatorId, getAccessToken }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<SweepSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingWallet, setEditingWallet] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showCashOut, setShowCashOut] = useState(false);

  const fetchSweepData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "get_sweep_history" }),
        }
      );
      const json = await res.json();
      if (!json.error) setData(json);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => { fetchSweepData(); }, [fetchSweepData]);

  const savePayoutWallet = async () => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletInput)) {
      toast.error("Invalid wallet address");
      return;
    }
    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "set_payout_wallet", payout_wallet: walletInput }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Payout wallet updated");
        setEditingWallet(false);
        fetchSweepData();
      } else {
        toast.error(json.error || "Failed to update wallet");
      }
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const retryFailedSweeps = async () => {
    setRetrying(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "retry_failed_sweeps" }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.reset_count} failed sweeps queued for retry`);
        fetchSweepData();
      }
    } catch {
    } finally {
      setRetrying(false);
    }
  };

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": case "reconciled": return <CheckCircle2 size={14} className="text-emerald-400" />;
      case "sending": return <Clock size={14} className="text-yellow-400 animate-pulse" />;
      case "failed": return <XCircle size={14} className="text-red-400" />;
      default: return <Clock size={14} className="text-white/30" />;
    }
  };

  if (loading) {
    return <div className="text-white/40 text-sm py-8 text-center">Loading earnings…</div>;
  }

  if (!data) {
    return <div className="text-white/40 text-sm py-8 text-center">Unable to load earnings data</div>;
  }

  return (
    <div className="space-y-6">
      {/* Payout Wallet Balance + Cash Out */}
      {data.payout_wallet && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white/60 flex items-center gap-2">
              <DollarSign size={16} /> Payout Wallet Balance
            </h3>
            <Button
              size="sm"
              onClick={() => setShowCashOut(true)}
              disabled={data.payout_wallet_balance == null || data.payout_wallet_balance < 1}
              className="bg-emerald-600 hover:bg-emerald-500 border-0 text-xs gap-1"
            >
              <ArrowUpRight size={14} /> Cash Out
            </Button>
          </div>
          <div className="text-3xl font-bold text-white">
            ${data.payout_wallet_balance != null ? data.payout_wallet_balance.toFixed(2) : "—"}
          </div>
          <p className="text-xs text-white/30 mt-1">
            USDC.e in your payout wallet ({data.payout_wallet.slice(0, 6)}…{data.payout_wallet.slice(-4)}) — send to exchange or another wallet anytime
          </p>
        </div>
      )}

      {!data.payout_wallet && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-yellow-400" />
            <h3 className="text-sm font-semibold text-yellow-300">Payout Wallet Required</h3>
          </div>
          <p className="text-xs text-yellow-200/60">
            Set your payout wallet below to start receiving earnings. Without it, fees accrue in the platform treasury but cannot be swept to you.
          </p>
        </div>
      )}

      <CashOutModal
        open={showCashOut}
        onClose={() => setShowCashOut(false)}
        balance={data.payout_wallet_balance}
        onSuccess={() => { fetchSweepData(); }}
      />
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/60 flex items-center gap-2">
            <Wallet size={16} /> Payout Wallet
          </h3>
          {data.payout_wallet && !editingWallet && (
            <Button size="sm" variant="outline" onClick={() => { setEditingWallet(true); setWalletInput(data.payout_wallet || ""); }}
              className="border-white/10 text-white hover:bg-white/5 text-xs">
              Edit
            </Button>
          )}
        </div>

        {data.payout_wallet && !editingWallet ? (
          <div className="flex items-center gap-2">
            <code className="text-sm text-emerald-400 font-mono">{data.payout_wallet}</code>
            <button onClick={() => { navigator.clipboard.writeText(data.payout_wallet!); toast.success("Copied"); }}
              className="text-white/30 hover:text-white/60"><Copy size={14} /></button>
            <a href={`https://polygonscan.com/address/${data.payout_wallet}`} target="_blank" rel="noopener noreferrer"
              className="text-blue-400/60 hover:text-blue-400"><ExternalLink size={14} /></a>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              {data.payout_wallet ? "Update your payout wallet:" : "Set your Polygon wallet address to receive earnings automatically:"}
            </p>
            <div className="flex gap-2">
              <Input value={walletInput} onChange={(e) => setWalletInput(e.target.value)}
                placeholder="0x..." className="bg-white/5 border-white/10 text-white placeholder:text-white/20 font-mono text-sm" />
              <Button onClick={savePayoutWallet} disabled={saving} size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 border-0 whitespace-nowrap">
                {saving ? "Saving…" : "Save"}
              </Button>
              {editingWallet && (
                <Button onClick={() => setEditingWallet(false)} size="sm" variant="outline"
                  className="border-white/10 text-white hover:bg-white/5">Cancel</Button>
              )}
            </div>
          </div>
        )}

        {!data.payout_wallet && (
          <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-300">
            <AlertTriangle size={14} className="inline mr-1" />
            Set your payout wallet to start receiving earnings automatically. Without it, earnings accrue but are not sent to your wallet.
          </div>
        )}
      </div>

      {/* Earnings Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <div className="text-white/40 text-xs mb-1">Total Earned</div>
          <div className="text-xl font-bold text-white">${data.total_earned.toFixed(2)}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <div className="text-white/40 text-xs mb-1 flex items-center gap-1"><CheckCircle2 size={12} /> Sent to Wallet</div>
          <div className="text-xl font-bold text-emerald-400">${data.total_swept.toFixed(2)}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <div className="text-white/40 text-xs mb-1 flex items-center gap-1"><Clock size={12} /> Pending</div>
          <div className="text-xl font-bold text-yellow-400">
            ${(data.pending_sweep + data.accrued).toFixed(2)}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <div className="text-white/40 text-xs mb-1 flex items-center gap-1"><XCircle size={12} /> Failed</div>
          <div className="text-xl font-bold text-red-400">${data.failed_sweep.toFixed(2)}</div>
        </div>
      </div>

      {/* Failed sweep retry */}
      {data.failed_sweep > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-red-400">Failed Sweeps</div>
            <div className="text-xs text-white/40">${data.failed_sweep.toFixed(2)} in fees failed to send — retry to queue them again</div>
          </div>
          <Button onClick={retryFailedSweeps} disabled={retrying} size="sm"
            className="bg-red-600 hover:bg-red-500 border-0 gap-1">
            <RefreshCw size={14} className={retrying ? "animate-spin" : ""} />
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}

      {/* How it works */}
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-xs text-white/30 space-y-1">
        <p className="text-white/50 font-medium mb-2">How Earnings Work</p>
        <p>• When a user places a prediction on your app, fees are collected automatically</p>
        <p>• Your share is sent directly to your payout wallet in USDC (on Polygon)</p>
        <p>• Once in your wallet, you can hold, send to another wallet, or send to an exchange</p>
        <p>• If a sweep fails, use the Retry button to re-queue it</p>
      </div>

      {/* Transaction History */}
      {data.sweeps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/60 mb-3">Transaction History</h3>
          <div className="space-y-2">
            {data.sweeps.map((s) => (
              <div key={s.id} className="bg-white/[0.03] border border-white/5 rounded-lg p-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  {statusIcon(s.sweep_status)}
                  <div>
                    <div className="font-medium text-white">${Number(s.operator_fee_usdc).toFixed(2)}</div>
                    <div className="text-[10px] text-white/30">
                      {s.sweep_completed_at
                        ? new Date(s.sweep_completed_at).toLocaleDateString()
                        : s.sweep_attempted_at
                          ? `Attempted ${new Date(s.sweep_attempted_at).toLocaleDateString()}`
                          : new Date(s.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    s.sweep_status === "sent" || s.sweep_status === "reconciled"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : s.sweep_status === "failed"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-yellow-500/10 text-yellow-400"
                  }`}>
                    {s.sweep_status}
                  </span>
                  {s.sweep_tx_hash && (
                    <a href={`https://polygonscan.com/tx/${s.sweep_tx_hash}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400/60 hover:text-blue-400">
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
