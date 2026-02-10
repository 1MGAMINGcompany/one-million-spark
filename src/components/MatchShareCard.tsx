import { Trophy, Coins, TrendingUp, Award } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { lamportsToSolDisplay } from '@/lib/shareMatch';

interface WinnerStats {
  wins?: number;
  win_rate?: number | null;
  total_sol_won?: number;
}

interface MatchShareCardProps {
  gameType: string;
  winnerWallet: string | null;
  winnerPayoutLamports: number | null;
  winReason: string;
  winnerStats?: WinnerStats | null;
  mode?: string;
}

function shortenWallet(wallet: string, chars = 4): string {
  return `${wallet.slice(0, chars)}…${wallet.slice(-chars)}`;
}

function formatGameType(gameType: string): string {
  const map: Record<string, string> = {
    chess: 'Chess',
    checkers: 'Checkers',
    backgammon: 'Backgammon',
    dominos: 'Dominos',
    ludo: 'Ludo',
  };
  return map[gameType.toLowerCase()] || gameType;
}

export function MatchShareCard({
  gameType,
  winnerWallet,
  winnerPayoutLamports,
  winReason,
  winnerStats,
  mode,
}: MatchShareCardProps) {
  const isDraw = winReason === 'draw' || !winnerWallet;

  return (
    <Card className="w-full max-w-md border-primary/40 bg-gradient-to-br from-card via-card to-primary/5 shadow-gold overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-4 border-b border-primary/20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/20">
            <Trophy size={24} className="text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {isDraw ? 'Match Draw' : 'Match Victory'}
            </p>
            <h3 className="text-lg font-bold text-foreground">
              {formatGameType(gameType)}
              {mode === 'ranked' && (
                <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                  Ranked
                </span>
              )}
            </h3>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Winner */}
        {!isDraw && winnerWallet && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Winner</p>
            <p className="font-mono text-primary font-semibold text-sm">
              {shortenWallet(winnerWallet)}
            </p>
          </div>
        )}

        {/* SOL Won */}
        {winnerPayoutLamports && winnerPayoutLamports > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <Coins size={18} className="text-primary" />
              <span className="text-2xl font-bold text-primary font-mono">
                {lamportsToSolDisplay(winnerPayoutLamports)}
              </span>
              <span className="text-sm text-muted-foreground">SOL</span>
            </div>
          </div>
        )}

        {/* Brag Stats - Only positive stats */}
        {winnerStats && (
          <div className="grid grid-cols-3 gap-3">
            {winnerStats.total_sol_won != null && winnerStats.total_sol_won > 0 && (
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <Coins size={14} className="text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Total SOL</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {winnerStats.total_sol_won.toFixed(2)}
                </p>
              </div>
            )}
            {winnerStats.win_rate != null && winnerStats.win_rate > 0 && (
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <TrendingUp size={14} className="text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {(winnerStats.win_rate * 100).toFixed(0)}%
                </p>
              </div>
            )}
            {winnerStats.wins != null && winnerStats.wins > 0 && (
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <Award size={14} className="text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Wins</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {winnerStats.wins}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Branding */}
        <div className="text-center pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            ⚡ Powered by <span className="text-primary font-semibold">1M Gaming</span>
          </p>
        </div>
      </div>
    </Card>
  );
}
