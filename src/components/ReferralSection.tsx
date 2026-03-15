/**
 * Referral Section - shown on player profile
 * Shows referral code, copy link, stats, and recent rewards
 */
import { useEffect, useState } from "react";
import { Copy, Users, Coins, Gift, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ReferralStats {
  referralCode: string;
  totalReferred: number;
  totalAccrued: number; // lamports
  totalPaid: number; // lamports
}

interface ReferralReward {
  id: string;
  player_wallet: string;
  source_type: string;
  referral_reward_amount: number;
  status: string;
  created_at: string;
}

function formatSol(lamports: number): string {
  const sol = lamports / 1_000_000_000;
  if (sol === 0) return "0";
  if (sol < 0.0001) return "<0.0001";
  return sol.toFixed(4).replace(/\.?0+$/, "");
}

function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function ReferralSection({ wallet }: { wallet: string }) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReferralData = async () => {
      try {
        // Get profile for referral code
        const { data: profile } = await supabase
          .from("player_profiles")
          .select("referral_code")
          .eq("wallet", wallet)
          .maybeSingle();

        if (!profile?.referral_code) {
          setLoading(false);
          return;
        }

        // Count referred users
        const { count: referredCount } = await supabase
          .from("player_profiles")
          .select("wallet", { count: "exact", head: true })
          .eq("referred_by_wallet", wallet);

        // Get reward totals
        const { data: rewardsData } = await supabase
          .from("referral_rewards")
          .select("referral_reward_amount, status")
          .eq("referrer_wallet", wallet);

        let totalAccrued = 0;
        let totalPaid = 0;
        if (rewardsData) {
          for (const r of rewardsData) {
            if (r.status === "accrued") totalAccrued += r.referral_reward_amount;
            if (r.status === "paid") totalPaid += r.referral_reward_amount;
          }
        }

        setStats({
          referralCode: profile.referral_code,
          totalReferred: referredCount || 0,
          totalAccrued,
          totalPaid,
        });

        // Get recent rewards
        const { data: recentRewards } = await supabase
          .from("referral_rewards")
          .select("id, player_wallet, source_type, referral_reward_amount, status, created_at")
          .eq("referrer_wallet", wallet)
          .order("created_at", { ascending: false })
          .limit(10);

        if (recentRewards) {
          setRewards(recentRewards);
        }
      } catch (err) {
        console.error("[ReferralSection] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchReferralData();
  }, [wallet]);

  const handleCopyLink = async () => {
    if (!stats?.referralCode) return;
    const link = `${window.location.origin}/?ref=${stats.referralCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Referral link copied!", description: "Share it with friends to earn rewards." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!stats?.referralCode) return;
    const link = `${window.location.origin}/?ref=${stats.referralCode}`;
    const text = `🎮 Join me on 1M Gaming! Play chess, checkers, backgammon & more for SOL. Use my invite link: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "1M Gaming Invite", text, url: link });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Invite message copied!" });
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur mt-6">
        <CardContent className="p-6">
          <div className="animate-pulse h-20 bg-muted/30 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur mt-6 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-4 border-b border-border/30">
        <div className="flex items-center gap-2 mb-1">
          <Gift className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Referral Program</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Earn 20% of platform fees from referred players
        </p>
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Referral Code & Link */}
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Your Referral Code</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold font-mono text-primary tracking-wider">
              {stats.referralCode}
            </span>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleCopyLink}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
            <Button
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={handleShare}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <Users className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{stats.totalReferred}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Referred</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <Coins className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-primary">{formatSol(stats.totalAccrued)}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Accrued</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <Coins className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-emerald-400">{formatSol(stats.totalPaid)}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid</p>
          </div>
        </div>

        {/* Recent Rewards */}
        {rewards.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Recent Rewards
            </p>
            <div className="space-y-1.5">
              {rewards.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${
                      r.status === "paid"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-primary/20 text-primary"
                    }`}>
                      {r.status}
                    </span>
                    <span className="text-muted-foreground">
                      {shortenWallet(r.player_wallet)}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {r.source_type.replace("_", " ")}
                    </span>
                  </div>
                  <span className="font-mono text-foreground">
                    +{formatSol(r.referral_reward_amount)} SOL
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rewards.length === 0 && stats.totalReferred > 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            No rewards yet. Rewards are earned when your referrals play games.
          </p>
        )}

        {stats.totalReferred === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Share your referral link to start earning rewards!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
