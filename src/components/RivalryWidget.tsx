/**
 * RivalryWidget - Shows head-to-head stats between two players
 * Displays in rematches to build retention through personal rivalries
 */

import { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import { getH2HStats } from '@/lib/matchHistory';

interface RivalryWidgetProps {
  playerA: string; // Current user's wallet
  playerB: string; // Opponent's wallet
  gameType?: string;
  isLoser?: boolean; // If current user is losing the rivalry
}

// Shorten wallet address for display
function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-3)}`;
}

export function RivalryWidget({ playerA, playerB, gameType, isLoser }: RivalryWidgetProps) {
  const [stats, setStats] = useState<{
    aWins: number;
    bWins: number;
    totalGames: number;
    streakOwner: string | null;
    streak: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!playerA || !playerB) {
        setLoading(false);
        return;
      }

      try {
        const result = await getH2HStats(playerA, playerB, gameType);
        if (result.ok && result.data) {
          setStats(result.data);
        }
      } catch (err) {
        console.warn('[RivalryWidget] Failed to fetch h2h stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [playerA, playerB, gameType]);

  // Don't render if loading or no games played
  if (loading || !stats || stats.totalGames === 0) {
    return null;
  }

  const userWins = stats.aWins;
  const opponentWins = stats.bWins;
  const userHasStreak = stats.streakOwner === playerA;
  const opponentHasStreak = stats.streakOwner === playerB;
  const streak = stats.streak;

  // Determine if user is losing the rivalry
  const userIsLosing = opponentWins > userWins;
  const isTied = userWins === opponentWins;

  // Nudge message when losing
  const getNudgeMessage = () => {
    if (userIsLosing) {
      const diff = opponentWins - userWins;
      if (diff === 1) {
        return "Win the next game to tie the series.";
      }
      return `Win ${diff} more to tie the series.`;
    }
    return null;
  };

  const nudge = getNudgeMessage();

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-amber-400">
        <Flame className="h-4 w-4" />
        <span className="text-sm font-semibold uppercase tracking-wide">Rivalry</span>
      </div>

      {/* Matchup */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono text-foreground">
          You vs {shortenWallet(playerB)}
        </span>
      </div>

      {/* Record */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">Record:</span>
        <span className="font-semibold text-foreground">
          <span className={userWins > opponentWins ? 'text-emerald-400' : ''}>{userWins}</span>
          <span className="text-muted-foreground"> – </span>
          <span className={opponentWins > userWins ? 'text-red-400' : ''}>{opponentWins}</span>
        </span>
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">Streak:</span>
          <span className={`font-semibold ${userHasStreak ? 'text-emerald-400' : 'text-red-400'}`}>
            {userHasStreak ? 'You' : shortenWallet(playerB)} ({streak} win{streak > 1 ? 's' : ''})
          </span>
        </div>
      )}

      {/* Nudge for losers */}
      {nudge && (
        <p className="text-xs text-amber-300/80 italic pt-1 border-t border-amber-500/20">
          {nudge}
        </p>
      )}
    </div>
  );
}
