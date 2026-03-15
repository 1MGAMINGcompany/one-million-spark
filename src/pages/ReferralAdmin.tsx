/**
 * Referral Admin Dashboard
 * Issue codes, view top referrers, totals, recent events
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Coins, Shield, TrendingUp, Loader2, Plus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "@/hooks/use-toast";

interface TopReferrer {
  wallet: string;
  referred_count: number;
  total_accrued: number;
  total_paid: number;
}

interface RecentReward {
  id: string;
  referrer_wallet: string;
  player_wallet: string;
  source_type: string;
  referral_reward_amount: number;
  status: string;
  created_at: string;
}

interface IssuedCode {
  wallet: string;
  referral_code: string;
  referral_label: string | null;
}

function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatSol(lamports: number): string {
  const sol = lamports / 1_000_000_000;
  if (sol === 0) return "0";
  return sol.toFixed(4).replace(/\.?0+$/, "");
}

const ADMIN_WALLETS = [
  "GA4oxfEHPCjo7KTLWMyxjq2J5tEScihqvFh5rFMM88JX",
];

export default function ReferralAdmin() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [recentRewards, setRecentRewards] = useState<RecentReward[]>([]);
  const [issuedCodes, setIssuedCodes] = useState<IssuedCode[]>([]);
  const [totals, setTotals] = useState({ accrued: 0, paid: 0, totalReferred: 0 });

  // Issue code form
  const [targetWallet, setTargetWallet] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [label, setLabel] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchData = async () => {
    if (!address) return;

    const { data: adminRow } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", address)
      .maybeSingle();

    const admin = !!adminRow || ADMIN_WALLETS.includes(address);
    setIsAdmin(admin);
    if (!admin) { setLoading(false); return; }

    try {
      // Fetch issued codes
      const { data: codes } = await supabase
        .from("player_profiles")
        .select("wallet, referral_code, referral_label")
        .not("referral_code", "is", null)
        .order("created_at", { ascending: false });

      if (codes) setIssuedCodes(codes as IssuedCode[]);

      // Fetch rewards for aggregation
      const { data: allRewards } = await supabase
        .from("referral_rewards")
        .select("referrer_wallet, referral_reward_amount, status");

      if (allRewards) {
        const referrerMap = new Map<string, { accrued: number; paid: number; count: number }>();
        let totalAccrued = 0, totalPaid = 0;

        for (const r of allRewards) {
          const entry = referrerMap.get(r.referrer_wallet) || { accrued: 0, paid: 0, count: 0 };
          entry.count++;
          if (r.status === "accrued") { entry.accrued += r.referral_reward_amount; totalAccrued += r.referral_reward_amount; }
          else if (r.status === "paid") { entry.paid += r.referral_reward_amount; totalPaid += r.referral_reward_amount; }
          referrerMap.set(r.referrer_wallet, entry);
        }

        const { count: totalReferred } = await supabase
          .from("player_profiles")
          .select("wallet", { count: "exact", head: true })
          .not("referred_by_wallet", "is", null);

        setTotals({ accrued: totalAccrued, paid: totalPaid, totalReferred: totalReferred || 0 });

        const topArr: TopReferrer[] = Array.from(referrerMap.entries())
          .map(([wallet, data]) => ({ wallet, referred_count: data.count, total_accrued: data.accrued, total_paid: data.paid }))
          .sort((a, b) => b.total_accrued - a.total_accrued)
          .slice(0, 20);
        setTopReferrers(topArr);
      }

      const { data: recent } = await supabase
        .from("referral_rewards")
        .select("id, referrer_wallet, player_wallet, source_type, referral_reward_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (recent) setRecentRewards(recent);
    } catch (err) {
      console.error("[ReferralAdmin] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [address]);

  const handleIssueCode = async () => {
    if (!address || !targetWallet || !customCode) return;
    setIssuing(true);
    try {
      const { data, error } = await supabase.functions.invoke("referral-admin-set-code", {
        body: { adminWallet: address, targetWallet: targetWallet.trim(), customCode: customCode.trim(), label: label.trim() || null },
      });

      if (error || !data?.success) {
        const msg = data?.message || data?.error || "Failed to issue code";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } else {
        toast({ title: "Code Issued", description: `Code "${data.code}" assigned to ${shortenWallet(data.wallet)}` });
        setTargetWallet("");
        setCustomCode("");
        setLabel("");
        fetchData();
      }
    } catch (err) {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setIssuing(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/?ref=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

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
            <div className="grid grid-cols-2 gap-3">
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

      {/* Issued Codes */}
      {issuedCodes.length > 0 && (
        <Card className="border-border/50 bg-card/80 backdrop-blur mb-6">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Issued Codes ({issuedCodes.length})</h3>
            <div className="space-y-1.5">
              {issuedCodes.map((c) => (
                <div key={c.wallet} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary">{c.referral_code}</span>
                    <span className="font-mono text-muted-foreground">{shortenWallet(c.wallet)}</span>
                    {c.referral_label && (
                      <span className="text-xs text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{c.referral_label}</span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyCode(c.referral_code)}>
                    {copiedCode === c.referral_code ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{totals.totalReferred}</p>
            <p className="text-xs text-muted-foreground uppercase">Total Referred</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4 text-center">
            <Coins className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-primary">{formatSol(totals.accrued)}</p>
            <p className="text-xs text-muted-foreground uppercase">Accrued SOL</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4 text-center">
            <Coins className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-emerald-400">{formatSol(totals.paid)}</p>
            <p className="text-xs text-muted-foreground uppercase">Paid SOL</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Referrers */}
      <Card className="border-border/50 bg-card/80 backdrop-blur mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Top Referrers</h3>
          </div>
          {topReferrers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No referral data yet</p>
          ) : (
            <div className="space-y-2">
              {topReferrers.map((r, i) => (
                <div key={r.wallet} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-5 text-right">#{i + 1}</span>
                    <span className="font-mono text-foreground">{shortenWallet(r.wallet)}</span>
                    <span className="text-xs text-muted-foreground">{r.referred_count} reward{r.referred_count !== 1 ? "s" : ""}</span>
                  </div>
                  <span className="font-mono text-primary">{formatSol(r.total_accrued + r.total_paid)} SOL</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Rewards */}
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">Recent Referral Events</h3>
          {recentRewards.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No events yet</p>
          ) : (
            <div className="space-y-1.5">
              {recentRewards.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`uppercase px-1.5 py-0.5 rounded font-medium ${
                      r.status === "paid" ? "bg-emerald-500/20 text-emerald-400" : "bg-primary/20 text-primary"
                    }`}>{r.status}</span>
                    <span className="text-muted-foreground">{shortenWallet(r.referrer_wallet)} ← {shortenWallet(r.player_wallet)}</span>
                    <span className="text-muted-foreground capitalize">{r.source_type.replace("_", " ")}</span>
                  </div>
                  <span className="font-mono text-foreground">+{formatSol(r.referral_reward_amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
