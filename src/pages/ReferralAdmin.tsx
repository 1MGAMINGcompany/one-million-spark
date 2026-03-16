/**
 * Referral Admin Dashboard
 * Issue codes, view top referrers, totals, recent events, record payouts
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Loader2, Plus, Copy, Check, DollarSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "@/hooks/use-toast";

/* ───── types ───── */
interface ReferrerProfile {
  wallet: string;
  referral_code: string;
  referral_label: string | null;
  referral_percentage: number;
}

interface PayoutLog {
  id: string;
  referral_wallet: string;
  referral_code: string | null;
  amount_sol: number;
  paid_at: string;
  paid_by_admin_wallet: string;
  tx_hash: string | null;
  note: string | null;
}

/* ───── helpers ───── */
function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatSol(lamports: number): string {
  const sol = lamports / 1_000_000_000;
  if (sol === 0) return "0";
  return sol.toFixed(4).replace(/\.?0+$/, "");
}

function fmtSol(n: number): string {
  if (n === 0) return "0";
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const PERCENTAGE_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

/* ───── main component ───── */
export default function ReferralAdmin() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Data
  const [referrers, setReferrers] = useState<ReferrerProfile[]>([]);
  const [earnedMap, setEarnedMap] = useState<Map<string, number>>(new Map());
  const [paidMap, setPaidMap] = useState<Map<string, number>>(new Map());
  const [payoutLogs, setPayoutLogs] = useState<PayoutLog[]>([]);
  const [lastPayoutMap, setLastPayoutMap] = useState<Map<string, string>>(new Map());
  const [totals, setTotals] = useState({ totalReferred: 0, totalEarned: 0, totalPaid: 0 });

  // Issue code form
  const [targetWallet, setTargetWallet] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [label, setLabel] = useState("");
  const [percentage, setPercentage] = useState("20");
  const [issuing, setIssuing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Payout modal
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutWallet, setPayoutWallet] = useState("");
  const [payoutCode, setPayoutCode] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutTxHash, setPayoutTxHash] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutUnpaid, setPayoutUnpaid] = useState(0);
  const [submittingPayout, setSubmittingPayout] = useState(false);

  /* ───── fetch ───── */
  const fetchData = async () => {
    if (!address) { setLoading(false); return; }

    const { data: adminRow } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", address)
      .maybeSingle();

    const admin = !!adminRow;
    setIsAdmin(admin);
    if (!admin) { setLoading(false); return; }

    try {
      // Fetch referrers (profiles with codes)
      const { data: codes } = await supabase
        .from("player_profiles")
        .select("wallet, referral_code, referral_label, referral_percentage")
        .not("referral_code", "is", null)
        .order("created_at", { ascending: false });

      if (codes) setReferrers(codes as ReferrerProfile[]);

      // Fetch all referral_rewards for earned totals
      const { data: allRewards } = await supabase
        .from("referral_rewards")
        .select("referrer_wallet, referral_reward_amount");

      const earned = new Map<string, number>();
      let totalEarned = 0;
      if (allRewards) {
        for (const r of allRewards) {
          earned.set(r.referrer_wallet, (earned.get(r.referrer_wallet) || 0) + r.referral_reward_amount);
          totalEarned += r.referral_reward_amount;
        }
      }
      setEarnedMap(earned);

      // Fetch payout logs
      const { data: logs } = await supabase
        .from("referral_payout_logs")
        .select("*")
        .order("paid_at", { ascending: false });

      const paid = new Map<string, number>();
      const lastPayout = new Map<string, string>();
      let totalPaidSol = 0;
      if (logs) {
        setPayoutLogs(logs as PayoutLog[]);
        for (const l of logs as PayoutLog[]) {
          const solLamports = l.amount_sol * 1_000_000_000;
          paid.set(l.referral_wallet, (paid.get(l.referral_wallet) || 0) + solLamports);
          totalPaidSol += solLamports;
          if (!lastPayout.has(l.referral_wallet)) {
            lastPayout.set(l.referral_wallet, l.paid_at);
          }
        }
      }
      setPaidMap(paid);
      setLastPayoutMap(lastPayout);

      // Total referred count
      const { count: totalReferred } = await supabase
        .from("player_profiles")
        .select("wallet", { count: "exact", head: true })
        .not("referred_by_wallet", "is", null);

      setTotals({ totalReferred: totalReferred || 0, totalEarned, totalPaid: totalPaidSol });
    } catch (err) {
      console.error("[ReferralAdmin] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [address]);

  /* ───── issue code ───── */
  const handleIssueCode = async () => {
    if (!address || !targetWallet || !customCode) return;
    setIssuing(true);
    try {
      const { data, error } = await supabase.functions.invoke("referral-admin-set-code", {
        body: {
          adminWallet: address,
          targetWallet: targetWallet.trim(),
          customCode: customCode.trim(),
          label: label.trim() || null,
          percentage: Number(percentage),
        },
      });

      if (error || !data?.success) {
        toast({ title: "Error", description: data?.message || data?.error || "Failed to issue code", variant: "destructive" });
      } else {
        toast({ title: "Code Issued", description: `Code "${data.code}" assigned at ${data.percentage}%` });
        setTargetWallet(""); setCustomCode(""); setLabel(""); setPercentage("20");
        fetchData();
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIssuing(false);
    }
  };

  /* ───── record payout ───── */
  const openPayoutModal = (wallet: string, code: string, unpaidLamports: number) => {
    setPayoutWallet(wallet);
    setPayoutCode(code);
    setPayoutUnpaid(unpaidLamports);
    setPayoutAmount("");
    setPayoutTxHash("");
    setPayoutNote("");
    setPayoutOpen(true);
  };

  const handleRecordPayout = async () => {
    if (!address || !payoutWallet) return;
    const amt = Number(payoutAmount);
    if (!amt || amt <= 0) {
      toast({ title: "Error", description: "Amount must be > 0", variant: "destructive" });
      return;
    }
    const unpaidSol = payoutUnpaid / 1_000_000_000;
    if (amt > unpaidSol + 0.0001) {
      toast({ title: "Error", description: `Amount exceeds unpaid balance of ${fmtSol(unpaidSol)} SOL`, variant: "destructive" });
      return;
    }
    setSubmittingPayout(true);
    try {
      const { data, error } = await supabase.functions.invoke("referral-admin-record-payout", {
        body: {
          adminWallet: address,
          referralWallet: payoutWallet,
          referralCode: payoutCode || null,
          amountSol: amt,
          txHash: payoutTxHash.trim() || null,
          note: payoutNote.trim() || null,
        },
      });
      if (error || !data?.success) {
        toast({ title: "Error", description: data?.message || data?.error || "Failed to record payout", variant: "destructive" });
      } else {
        toast({ title: "Payout Recorded", description: `${amt} SOL recorded for ${shortenWallet(payoutWallet)}` });
        setPayoutOpen(false);
        fetchData();
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setSubmittingPayout(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/?ref=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  /* ───── loading / access gate ───── */
  if (loading) {
    return (
      <div className="container max-w-3xl py-8 px-4">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container max-w-3xl py-8 px-4">
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="text-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Admin Access Required</h3>
            <p className="text-muted-foreground">Connect an admin wallet to view referral data.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ───── render ───── */
  return (
    <div className="container max-w-3xl py-8 px-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/predictions/admin")} className="gap-2">
          <Shield className="h-4 w-4" /> Predictions Admin
        </Button>
      </div>

      <h1 className="text-2xl font-bold mb-6">Referral Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{totals.totalReferred}</p>
            <p className="text-xs text-muted-foreground uppercase">Total Referred</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{formatSol(totals.totalEarned)}</p>
            <p className="text-xs text-muted-foreground uppercase">Total Earned</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{formatSol(totals.totalPaid)}</p>
            <p className="text-xs text-muted-foreground uppercase">Total Paid</p>
          </CardContent>
        </Card>
      </div>

      {/* Issue Code Section */}
      <Card className="border-primary/30 bg-card/80 backdrop-blur mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Issue Referral Code</h3>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Wallet Address *</Label>
              <Input
                placeholder="Solana wallet address"
                value={targetWallet}
                onChange={(e) => setTargetWallet(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Code * (4-16 chars)</Label>
                <Input
                  placeholder="e.g. NINJA"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))}
                  className="mt-1 uppercase"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Label (optional)</Label>
                <Input
                  placeholder="e.g. John's Channel"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Percentage</Label>
                <Select value={percentage} onValueChange={setPercentage}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERCENTAGE_OPTIONS.map((p) => (
                      <SelectItem key={p} value={String(p)}>{p}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={handleIssueCode}
              disabled={issuing || !targetWallet || !customCode || customCode.length < 4}
              className="w-full"
            >
              {issuing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Issue Code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Referrer Profiles with earned/paid/unpaid */}
      {referrers.length > 0 && (
        <Card className="border-border/50 bg-card/80 backdrop-blur mb-6">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Referrer Profiles ({referrers.length})</h3>
            <div className="space-y-2">
              {referrers.map((r) => {
                const earned = earnedMap.get(r.wallet) || 0;
                const paid = paidMap.get(r.wallet) || 0;
                const unpaid = Math.max(0, earned - paid);
                const lastPay = lastPayoutMap.get(r.wallet);

                return (
                  <div key={r.wallet} className="p-3 bg-muted/20 rounded-lg text-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-primary">{r.referral_code}</span>
                        <span className="font-mono text-muted-foreground">{shortenWallet(r.wallet)}</span>
                        {r.referral_label && (
                          <span className="text-xs text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{r.referral_label}</span>
                        )}
                        <span className="text-xs font-medium bg-primary/20 text-primary px-1.5 py-0.5 rounded">{r.referral_percentage}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyCode(r.referral_code)}>
                          {copiedCode === r.referral_code ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                        {unpaid > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openPayoutModal(r.wallet, r.referral_code, unpaid)}
                          >
                            <DollarSign className="h-3 w-3" /> Pay
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Earned: <span className="text-primary font-mono">{formatSol(earned)}</span></span>
                      <span>Paid: <span className="text-emerald-400 font-mono">{formatSol(paid)}</span></span>
                      <span>Unpaid: <span className={`font-mono ${unpaid > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{formatSol(unpaid)}</span></span>
                      {lastPay && <span>Last payout: {fmtDate(lastPay)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payout History */}
      {payoutLogs.length > 0 && (
        <Card className="border-border/50 bg-card/80 backdrop-blur mb-6">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Payout History ({payoutLogs.length})</h3>
            <div className="space-y-1.5">
              {payoutLogs.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">{fmtDate(l.paid_at)}</span>
                    <span className="font-mono text-foreground">{shortenWallet(l.referral_wallet)}</span>
                    {l.referral_code && <span className="font-mono text-primary">{l.referral_code}</span>}
                    <span className="text-muted-foreground">by {shortenWallet(l.paid_by_admin_wallet)}</span>
                    {l.tx_hash && (
                      <a
                        href={`https://solscan.io/tx/${l.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        tx
                      </a>
                    )}
                    {l.note && <span className="text-muted-foreground italic">"{l.note}"</span>}
                  </div>
                  <span className="font-mono text-emerald-400 whitespace-nowrap">+{fmtSol(l.amount_sol)} SOL</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payout Modal */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payout</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Referral Wallet</Label>
              <p className="font-mono text-sm">{shortenWallet(payoutWallet)}</p>
            </div>
            {payoutCode && (
              <div>
                <Label className="text-xs text-muted-foreground">Referral Code</Label>
                <p className="font-mono text-sm text-primary">{payoutCode}</p>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Unpaid Balance</Label>
              <p className="font-mono text-sm text-amber-400">{formatSol(payoutUnpaid)} SOL</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Amount (SOL) *</Label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="0.00"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tx Hash (optional)</Label>
              <Input
                placeholder="Solana transaction signature"
                value={payoutTxHash}
                onChange={(e) => setPayoutTxHash(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Note (optional)</Label>
              <Textarea
                placeholder="e.g. March payout"
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <Button
              onClick={handleRecordPayout}
              disabled={submittingPayout || !payoutAmount || Number(payoutAmount) <= 0}
              className="w-full"
            >
              {submittingPayout ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
              Record Payout
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
