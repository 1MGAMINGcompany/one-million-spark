import { Trophy, Clock, Coins, TrendingUp, Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WalletLink } from "@/components/WalletLink";
import { useTranslation } from "react-i18next";
import {
  shortenAddress,
  lamportsToSol,
  getGameDisplayName,
} from "@/lib/shareMatch";

// Match data type from match-get edge function
export interface MatchData {
  room_pda: string;
  game_type: string;
  mode: string;
  stake_lamports: number;
  stake_sol?: number;
  pot_sol?: number;
  fee_sol?: number;
  winner_payout_sol?: number;
  winner_wallet: string | null;
  loser_wallet: string | null;
  winner_display?: string;
  loser_display?: string;
  win_reason: string;
  finished_at?: string;
  tx_signature?: string;
  winner_rank_before?: number | null;
  winner_rank_after?: number | null;
  loser_rank_before?: number | null;
  loser_rank_after?: number | null;
  metadata?: Record<string, unknown>;
}

export interface WinnerProfile {
  total_sol_won: number;
  current_streak: number;
  favorite_game: string | null;
  wins: number;
  losses: number;
  games_played: number;
}

interface MatchShareCardProps {
  matchData: MatchData;
  winnerProfile?: WinnerProfile | null;
  compact?: boolean;
}

export function MatchShareCard({ matchData, winnerProfile, compact = false }: MatchShareCardProps) {
  const { t } = useTranslation();
  
  const gameDisplayName = getGameDisplayName(matchData.game_type);
  const modeDisplay = (matchData.mode || "casual").charAt(0).toUpperCase() + (matchData.mode || "casual").slice(1);
  
  // Calculate display values
  const stakeSol = matchData.stake_sol ?? lamportsToSol(matchData.stake_lamports || 0);
  const potSol = matchData.pot_sol ?? stakeSol * 2;
  const feeBps = 500; // 5%
  const feeSol = matchData.fee_sol ?? (potSol * feeBps / 10000);
  const winnerPayoutSol = matchData.winner_payout_sol ?? (potSol - feeSol);
  
  // Format timestamp
  const finishedAt = matchData.finished_at ? new Date(matchData.finished_at) : null;
  const timeAgo = finishedAt ? getTimeAgo(finishedAt) : null;
  
  return (
    <Card className={`bg-gradient-to-br from-card via-card to-amber-950/20 border-amber-500/30 shadow-xl ${compact ? 'p-4' : 'p-6'}`}>
      <div className={`space-y-${compact ? '3' : '5'}`}>
        {/* Header: Game Type + Mode */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Trophy className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-foreground">{gameDisplayName}</h2>
              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">
                {modeDisplay}
              </Badge>
            </div>
          </div>
          {/* 1M Gaming branding */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">1M GAMING</p>
          </div>
        </div>

        {/* Winner Section */}
        <div className="bg-gradient-to-r from-amber-500/10 to-transparent rounded-lg p-4 border border-amber-500/20">
          <p className="text-xs uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1">
            <Award className="w-3 h-3" />
            {t("shareMatch.winner", "Winner")}
          </p>
          {matchData.winner_wallet ? (
            <WalletLink 
              wallet={matchData.winner_wallet} 
              className="text-foreground font-mono text-lg font-semibold"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>

        {/* Net Win Amount - Prominent */}
        <div className="bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 rounded-xl p-4 border-2 border-emerald-500/30 text-center">
          <p className="text-xs uppercase tracking-wider text-emerald-400 mb-1">
            {t("shareMatch.wonAmount", "Won")}
          </p>
          <p className="text-3xl font-bold text-emerald-400 font-mono">
            +{winnerPayoutSol.toFixed(4)} SOL
          </p>
        </div>

        {/* Stake Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Coins className="w-4 h-4" />
              <span className="text-xs">{t("shareMatch.stake", "Stake")}</span>
            </div>
            <p className="font-mono text-foreground">{stakeSol.toFixed(4)} SOL × 2</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">{t("shareMatch.fee", "Platform Fee")}</span>
            </div>
            <p className="font-mono text-foreground">{feeSol.toFixed(4)} SOL (5%)</p>
          </div>
        </div>

        {/* Winner Stats - if available */}
        {winnerProfile && !compact && (
          <div className="border-t border-border/30 pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
              📊 {t("shareMatch.winnerStats", "Winner Stats")}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-primary font-mono">{winnerProfile.total_sol_won.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{t("shareMatch.totalWon", "Total Won")} (SOL)</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-400 font-mono">{winnerProfile.current_streak}</p>
                <p className="text-xs text-muted-foreground">{t("shareMatch.currentStreak", "Streak")}</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground font-mono">{winnerProfile.wins}</p>
                <p className="text-xs text-muted-foreground">Wins</p>
              </div>
            </div>
          </div>
        )}

        {/* Timestamp */}
        {timeAgo && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{timeAgo}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// Helper to format relative time
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  
  return date.toLocaleDateString();
}
