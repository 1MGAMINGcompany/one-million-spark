import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MatchShareCard } from '@/components/MatchShareCard';
import GoldConfettiExplosion from '@/components/GoldConfettiExplosion';
import { ShareMatchModal } from '@/components/ShareMatchModal';
import { copyMatchLink, lamportsToSolDisplay } from '@/lib/shareMatch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, Check, Share2 } from 'lucide-react';

interface MatchData {
  room_pda: string;
  game_type: string;
  mode: string;
  winner_wallet: string | null;
  loser_wallet: string | null;
  winner_payout_lamports: number | null;
  fee_lamports: number | null;
  win_reason: string;
  finished_at: string | null;
  tx_signature: string | null;
  stake_lamports: number;
}

interface WinnerProfile {
  wins: number;
  win_rate: number | null;
  total_sol_won: number;
}

export default function MatchPage() {
  const { roomPda } = useParams<{ roomPda: string }>();
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [winnerProfile, setWinnerProfile] = useState<WinnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!roomPda) return;

    const fetchMatch = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('match-get', {
          body: { roomPda },
        });

        if (fnError) throw fnError;

        if (data?.match) {
          setMatchData(data.match);
          setWinnerProfile(data.winnerProfile || null);
          // Show confetti after a brief delay
          setTimeout(() => setShowConfetti(true), 300);
        } else {
          setError('Match not found');
        }
      } catch (e: any) {
        console.error('[MatchPage] Error fetching match:', e);
        setError(e.message || 'Failed to load match');
      } finally {
        setLoading(false);
      }
    };

    fetchMatch();
  }, [roomPda]);

  const handleCopy = async () => {
    if (!roomPda) return;
    const ok = await copyMatchLink(roomPda);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const solWon = matchData?.winner_payout_lamports
    ? matchData.winner_payout_lamports / 1_000_000_000
    : undefined;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (error || !matchData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Match Not Found</h1>
          <p className="text-muted-foreground">{error || 'This match does not exist or has expired.'}</p>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
      <GoldConfettiExplosion active={showConfetti && !!matchData.winner_wallet} originX={50} originY={20} />

      <div className="w-full max-w-md space-y-6">
        {/* Match Card */}
        <MatchShareCard
          gameType={matchData.game_type}
          winnerWallet={matchData.winner_wallet}
          winnerPayoutLamports={matchData.winner_payout_lamports}
          winReason={matchData.win_reason}
          winnerStats={winnerProfile}
          mode={matchData.mode}
        />

        {/* Share Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2 border-primary/30"
            onClick={handleCopy}
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button
            variant="default"
            className="flex-1 gap-2"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={16} />
            Share
          </Button>
        </div>

        {/* TX link */}
        {matchData.tx_signature && (
          <a
            href={`https://explorer.solana.com/tx/${matchData.tx_signature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            View on Solana Explorer →
          </a>
        )}
      </div>

      {roomPda && (
        <ShareMatchModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          roomPda={roomPda}
          gameType={matchData.game_type}
          solWon={solWon}
        />
      )}
    </div>
  );
}
