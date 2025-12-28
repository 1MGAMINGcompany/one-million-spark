/**
 * Ranked Leaderboard Page
 * Shows top 50 players for a specific game type
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trophy, Loader2, Crown, Medal, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface LeaderboardEntry {
  wallet: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
}

// Tier thresholds with subtiers
const TIER_CONFIG = [
  { name: 'Grandmaster', min: 1700, color: 'text-purple-400', emoji: '👑' },
  { name: 'Diamond', min: 1500, color: 'text-cyan-300', emoji: '💎' },
  { name: 'Gold', min: 1300, color: 'text-amber-400', emoji: '🥇' },
  { name: 'Silver', min: 1100, color: 'text-slate-300', emoji: '🥈' },
  { name: 'Bronze', min: 0, color: 'text-amber-600', emoji: '🥉' },
] as const;

// Get subtier within a tier
function getSubtier(rating: number, tierMin: number, tierMax: number): string {
  const range = tierMax - tierMin;
  const position = rating - tierMin;
  const third = range / 3;
  
  if (position >= third * 2) return 'III';
  if (position >= third) return 'II';
  return 'I';
}

// Get rank tier from ELO rating
function getRankTier(rating: number): { fullTier: string; color: string; emoji: string } {
  for (let i = 0; i < TIER_CONFIG.length; i++) {
    const tier = TIER_CONFIG[i];
    if (rating >= tier.min) {
      if (tier.name === 'Grandmaster') {
        return { fullTier: tier.name, color: tier.color, emoji: tier.emoji };
      }
      const nextTierMin = i === 0 ? Infinity : TIER_CONFIG[i - 1].min;
      const subtier = getSubtier(rating, tier.min, nextTierMin);
      return { fullTier: `${tier.name} ${subtier}`, color: tier.color, emoji: tier.emoji };
    }
  }
  return { fullTier: 'Bronze I', color: 'text-amber-600', emoji: '🥉' };
}

// Shorten wallet for display
function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// Capitalize game name
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Valid game types
const VALID_GAMES = ['chess', 'dominos', 'backgammon', 'checkers', 'ludo'];

export default function Leaderboard() {
  const { game } = useParams<{ game: string }>();
  const navigate = useNavigate();
  
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const gameType = game?.toLowerCase() || 'chess';
  const isValidGame = VALID_GAMES.includes(gameType);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!isValidGame) {
        setError(`Invalid game type: ${game}`);
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('ratings')
          .select('wallet, rating, games, wins, losses')
          .eq('game_type', gameType)
          .order('rating', { ascending: false })
          .limit(50);

        if (fetchError) {
          console.error('[Leaderboard] Failed to fetch:', fetchError);
          setError('Failed to load leaderboard');
          return;
        }

        setEntries(data || []);
      } catch (err) {
        console.error('[Leaderboard] Error:', err);
        setError('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [gameType, isValidGame, game]);

  // Rank badge for top 3
  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground font-mono w-5 text-center">{rank}</span>;
  };

  if (loading) {
    return (
      <div className="container max-w-3xl py-8 px-4">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading leaderboard…</span>
        </div>
      </div>
    );
  }

  if (error || !isValidGame) {
    return (
      <div className="container max-w-3xl py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="text-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">{error || 'Invalid game'}</h3>
            <p className="text-muted-foreground mb-4">
              Choose a valid game type to view the leaderboard.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {VALID_GAMES.map((g) => (
                <Button key={g} variant="outline" size="sm" onClick={() => navigate(`/leaderboard/${g}`)}>
                  {capitalize(g)}
                </Button>
              ))}
            </div>
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

      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-b border-border/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Trophy className="h-6 w-6 text-primary" />
                {capitalize(gameType)} Leaderboard
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Top 50 ranked players
              </p>
            </div>
            
            {/* Game selector */}
            <div className="flex flex-wrap gap-2">
              {VALID_GAMES.map((g) => (
                <Button
                  key={g}
                  variant={g === gameType ? "default" : "outline"}
                  size="sm"
                  onClick={() => navigate(`/leaderboard/${g}`)}
                  className={g === gameType ? "shadow-gold" : ""}
                >
                  {capitalize(g)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No ranked players yet</h3>
              <p className="text-muted-foreground">
                Be the first to play a ranked {capitalize(gameType)} match!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold bg-muted/30">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-3">Rating</div>
                <div className="col-span-4 text-right">Record</div>
              </div>
              
              {/* Entries */}
              {entries.map((entry, index) => {
                const rank = getRankTier(entry.rating);
                const position = index + 1;
                const isTopThree = position <= 3;
                
                return (
                  <div
                    key={entry.wallet}
                    className={`grid grid-cols-12 gap-2 px-4 py-3 items-center transition-colors hover:bg-muted/20 ${
                      isTopThree ? 'bg-primary/5' : ''
                    }`}
                  >
                    {/* Rank */}
                    <div className="col-span-1 flex items-center">
                      {getRankBadge(position)}
                    </div>
                    
                    {/* Player wallet */}
                    <div className="col-span-4">
                      <Link
                        to={`/player/${entry.wallet}`}
                        className="font-mono text-sm text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
                      >
                        {shortenWallet(entry.wallet)}
                      </Link>
                    </div>
                    
                    {/* Rating + Tier */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{entry.rating}</span>
                        <span className={`text-xs ${rank.color}`}>
                          {rank.emoji}
                        </span>
                      </div>
                      <p className={`text-xs ${rank.color}`}>{rank.fullTier}</p>
                    </div>
                    
                    {/* Record */}
                    <div className="col-span-4 text-right">
                      <span className="font-semibold">
                        <span className="text-emerald-400">{entry.wins}</span>
                        <span className="text-muted-foreground mx-1">–</span>
                        <span className="text-red-400">{entry.losses}</span>
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {entry.games} game{entry.games !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
