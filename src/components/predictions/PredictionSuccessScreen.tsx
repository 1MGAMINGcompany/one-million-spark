import { Button } from "@/components/ui/button";
import { CheckCircle2, Eye, Clock, Trophy, Share2 } from "lucide-react";
import SocialShareModal from "@/components/SocialShareModal";
import { SOCIAL_SHARE_ENABLED } from "@/lib/socialShareConfig";
import type { Fight } from "./FightCard";

interface Props {
  fighterName: string;
  amountNum: number;
  fight: Fight;
  poolA: number;
  poolB: number;
  onClose: () => void;
  wallet?: string;
  referralCode: string | null;
  showShare: boolean;
  setShowShare: (v: boolean) => void;
}

export default function PredictionSuccessScreen({
  fighterName,
  amountNum,
  fight,
  poolA,
  poolB,
  onClose,
  wallet,
  referralCode,
  showShare,
  setShowShare,
}: Props) {
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 animate-in slide-in-from-bottom">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground font-['Cinzel']">
              Prediction Placed!
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              You picked <span className="font-bold text-foreground">{fighterName}</span>
            </p>
          </div>

          <div className="space-y-3 mb-6">
            <h4 className="text-sm font-bold text-foreground text-center">What Happens Next?</h4>

            <div className="flex items-start gap-3 bg-secondary/30 rounded-lg p-3">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Eye className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">1. Watch the fight</p>
                <p className="text-xs text-muted-foreground">Sit back and wait for the result</p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-secondary/30 rounded-lg p-3">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">2. Short safety buffer (~5 min)</p>
                <p className="text-xs text-muted-foreground">After the result, a brief verification period ensures fair payouts</p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-secondary/30 rounded-lg p-3">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Trophy className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">3. Claim your reward</p>
                <p className="text-xs text-muted-foreground">
                  If your fighter wins, a <span className="font-bold text-foreground">Claim Reward</span> button appears — tap it to receive your payout
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {SOCIAL_SHARE_ENABLED && (
              <Button variant="outline" className="gap-1.5" onClick={() => setShowShare(true)}>
                <Share2 className="w-4 h-4" /> Share Pick
              </Button>
            )}
            <Button onClick={onClose} className="flex-1" size="lg">
              Got it!
            </Button>
          </div>
        </div>
      </div>

      {SOCIAL_SHARE_ENABLED && (
        <SocialShareModal
          open={showShare}
          onClose={() => setShowShare(false)}
          variant="prediction"
          eventTitle={fight.title}
          sport={fight.event_name}
          fighterPick={fighterName}
          amountUsd={amountNum}
          poolUsd={poolA + poolB}
          wallet={wallet}
          referralCode={referralCode ?? undefined}
        />
      )}
    </>
  );
}
