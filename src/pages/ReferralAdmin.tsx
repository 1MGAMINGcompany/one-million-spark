/**
 * Referral Admin Dashboard
 * Shows top referrers, totals, recent events, abuse logs
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Coins, Shield, TrendingUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";

interface TopReferrer {
  wallet: string;
  referred_count: number;
  total_accrued: number;
  total_paid: number;
}

interface AbuseLog {
  id: string;
  wallet: string;
  attempted_code: string | null;
  reason: string;
  created_at: string;
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

function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatSol(lamports: number): string {
  const sol = lamports / 1_000_000_000;
  if (sol === 0) return "0";
  return sol.toFixed(4).replace(/\.?0+$/, "");
}

// Hardcoded admin wallets (same as prediction_admins)
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
  const [abuseLogs, setAbuseLogs] = useState<AbuseLog[]>([]);
  const [totals, setTotals] = useState({ accrued: 0, paid: 0, totalReferred: 0 });

  useEffect(() => {
    const checkAdminAndFetch = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      // Check admin status from prediction_admins table
      const { data: adminRow } = await supabase
        .from("prediction_admins")
        .select("wallet")
        .eq("wallet", address)
        .maybeSingle();

      const admin = !!adminRow || ADMIN_WALLETS.includes(address);
      setIsAdmin(admin);

      if (!admin) {
        setLoading(false);
        return;
      }

      try {
        // Fetch all rewards for aggregation
        const { data: allRewards } = await supabase
          .from("referral_rewards")
          .select("referrer_wallet, referral_reward_amount, status");

        if (allRewards) {
          // Aggregate by referrer
          const referrerMap = new Map<string, { accrued: number; paid: number; count: number }>();
          let totalAccrued = 0;
          let totalPaid = 0;

          for (const r of allRewards) {
            const entry = referrerMap.get(r.referrer_wallet) || { accrued: 0, paid: 0, count: 0 };
            entry.count++;
            if (r.status === "accrued") {
              entry.accrued += r.referral_reward_amount;
              totalAccrued += r.referral_reward_amount;
            } else if (r.status === "paid") {
              entry.paid += r.referral_reward_amount;
              totalPaid += r.referral_reward_amount;
            }
            referrerMap.set(r.referrer_wallet, entry);
          }

          // Count total referred users
          const { count: totalReferred } = await supabase
            .from("player_profiles")
            .select("wallet", { count: "exact", head: true })
            .not("referred_by_wallet", "is", null);

          setTotals({ accrued: totalAccrued, paid: totalPaid, totalReferred: totalReferred || 0 });

          // Top referrers sorted by accrued
          const topArr: TopReferrer[] = Array.from(referrerMap.entries())
            .map(([wallet, data]) => ({
              wallet,
              referred_count: data.count,
              total_accrued: data.accrued,
              total_paid: data.paid,
            }))
            .sort((a, b) => b.total_accrued - a.total_accrued)
            .slice(0, 20);

          setTopReferrers(topArr);
        }

        // Recent rewards
        const { data: recent } = await supabase
          .from("referral_rewards")
          .select("id, referrer_wallet, player_wallet, source_type, referral_reward_amount, status, created_at")
          .order("created_at", { ascending: false })
          .limit(20);

        if (recent) setRecentRewards(recent);

        // Abuse logs (read via service role won't work from client, but we have RLS blocking)
        // We'll skip this for now since abuse_logs has deny-all RLS
        // Admin can view via backend dashboard
      } catch (err) {
        console.error("[ReferralAdmin] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndFetch();
  }, [address]);

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
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <h1 className="text-2xl font-bold mb-6">Referral Dashboard</h1>

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
                    <span className="text-xs text-muted-foreground">
                      {r.referred_count} reward{r.referred_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="font-mono text-primary">
                    {formatSol(r.total_accrued + r.total_paid)} SOL
                  </span>
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
                      r.status === "paid"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-primary/20 text-primary"
                    }`}>
                      {r.status}
                    </span>
                    <span className="text-muted-foreground">
                      {shortenWallet(r.referrer_wallet)} ← {shortenWallet(r.player_wallet)}
                    </span>
                    <span className="text-muted-foreground capitalize">
                      {r.source_type.replace("_", " ")}
                    </span>
                  </div>
                  <span className="font-mono text-foreground">
                    +{formatSol(r.referral_reward_amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
