/**
 * Public Player Profile Page
 * Fighter-record style layout - no login, no edit, just facts
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Flame, Trophy, Target, Coins, Zap, Gamepad2, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface PlayerProfileData {
  wallet: string;
  games_played: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_sol_won: number;
  biggest_pot_won: number;
  current_streak: number;
  longest_streak: number;
  favorite_game: string | null;
  last_game_at: string | null;
}

interface RecentGame {
  game_type: string;
  isWin: boolean;
  pot: number;
  finalized_at: string;
}

// Shorten wallet for display
function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// Format SOL with max 4 decimals
function formatSol(value: number): string {
  if (value === 0) return '0';
  if (value < 0.0001) return '<0.0001';
  return value.toFixed(4).replace(/\.?0+$/, '');
}

// Capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// High Roller threshold in SOL
const HIGH_ROLLER_THRESHOLD = 0.5;

// Get player title (highest priority wins)
function getPlayerTitle(profile: PlayerProfileData): { title: string; color: string } | null {
  // Priority order (highest first)
  
  // Unstoppable - current streak >= 5
  if (profile.current_streak >= 5) {
    return { title: 'Unstoppable', color: 'text-purple-400' };
  }
  
  // Hot Hand - current streak >= 3
  if (profile.current_streak >= 3) {
    return { title: 'Hot Hand', color: 'text-amber-400' };
  }
  
  // Game-specific shark titles (favorite game + high win rate)
  if (profile.favorite_game && profile.win_rate >= 0.6 && profile.games_played >= 5) {
    const game = capitalize(profile.favorite_game);
    return { title: `${game} Shark`, color: 'text-cyan-400' };
  }
  
  // High Roller - biggest pot >= threshold
  if (Number(profile.biggest_pot_won) >= HIGH_ROLLER_THRESHOLD) {
    return { title: 'High Roller', color: 'text-emerald-400' };
  }
  
  // Veteran - 50+ games
  if (profile.games_played >= 50) {
    return { title: 'Veteran', color: 'text-blue-400' };
  }
  
  // New Challenger - < 10 games
  if (profile.games_played < 10) {
    return { title: 'New Challenger', color: 'text-muted-foreground' };
  }
  
  return null;
}

// Badge definitions
interface Badge {
  id: string;
  label: string;
  icon: string;
  color: string;
}

// Get player badges (max 3)
function getPlayerBadges(profile: PlayerProfileData): Badge[] {
  const badges: Badge[] = [];
  
  // Hot Streak badge
  if (profile.current_streak >= 3) {
    badges.push({
      id: 'hot-streak',
      label: 'Hot Streak',
      icon: '🔥',
      color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    });
  }
  
  // Big Winner badge (high total SOL won)
  if (Number(profile.total_sol_won) >= 1) {
    badges.push({
      id: 'big-winner',
      label: 'Big Winner',
      icon: '💰',
      color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    });
  }
  
  // Strategy Master badge (high win rate with enough games)
  if (profile.win_rate >= 0.65 && profile.games_played >= 10) {
    badges.push({
      id: 'strategy-master',
      label: 'Strategy Master',
      icon: '🧠',
      color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    });
  }
  
  // Return max 3 badges
  return badges.slice(0, 3);
}

export default function PlayerProfile() {
  const { wallet } = useParams<{ wallet: string }>();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<PlayerProfileData | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!wallet) {
        setError('No wallet specified');
        setLoading(false);
        return;
      }

      try {
        // Fetch profile
        const { data: profileData, error: profileError } = await supabase
          .from('player_profiles')
          .select('*')
          .eq('wallet', wallet)
          .maybeSingle();

        if (profileError) {
          console.error('[PlayerProfile] Failed to fetch profile:', profileError);
          setError('Failed to load profile');
          setLoading(false);
          return;
        }

        if (!profileData) {
          setError('Player not found');
          setLoading(false);
          return;
        }

        setProfile(profileData);

        // Fetch recent games (last 5 finalized matches involving this wallet)
        const { data: matchesData } = await supabase
          .from('matches')
          .select('game_type, winner_wallet, stake_lamports, max_players, finalized_at')
          .eq('status', 'finalized')
          .or(`creator_wallet.eq.${wallet},winner_wallet.eq.${wallet}`)
          .order('finalized_at', { ascending: false })
          .limit(5);

        if (matchesData) {
          const games: RecentGame[] = matchesData.map(m => ({
            game_type: m.game_type,
            isWin: m.winner_wallet === wallet,
            pot: (Number(m.stake_lamports) * (m.max_players || 2)) / 1_000_000_000,
            finalized_at: m.finalized_at || '',
          }));
          setRecentGames(games);
        }
      } catch (err) {
        console.error('[PlayerProfile] Error:', err);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [wallet]);

  if (loading) {
    return (
      <div className="container max-w-2xl py-8 px-4">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading profile…</span>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container max-w-2xl py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="text-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">{error || 'Player not found'}</h3>
            <p className="text-muted-foreground">
              This player hasn't competed in any games yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasHotStreak = profile.current_streak >= 3;
  const playerTitle = getPlayerTitle(profile);
  const playerBadges = getPlayerBadges(profile);

  return (
    <div className="container max-w-2xl py-8 px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        {/* Header - Fighter Record Style */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 border-b border-border/30">
          <p className="font-mono text-muted-foreground text-sm mb-1">
            {shortenWallet(profile.wallet)}
          </p>
          
          {/* Title */}
          {playerTitle && (
            <p className={`text-sm font-semibold uppercase tracking-wide mb-2 ${playerTitle.color}`}>
              {playerTitle.title}
            </p>
          )}
          
          <div className="flex items-baseline gap-3">
            <span className="text-muted-foreground text-lg">Record:</span>
            <span className="text-4xl font-bold text-foreground">
              <span className="text-emerald-400">{profile.wins}</span>
              <span className="text-muted-foreground mx-2">–</span>
              <span className="text-red-400">{profile.losses}</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {profile.games_played} game{profile.games_played !== 1 ? 's' : ''} played
          </p>
          
          {/* Badges Row */}
          {playerBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {playerBadges.map((badge) => (
                <span
                  key={badge.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.color}`}
                >
                  <span>{badge.icon}</span>
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <CardContent className="p-6 space-y-6">
          {/* Hot Streak Banner */}
          {hasHotStreak && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <Flame className="h-5 w-5 text-amber-400" />
              <span className="text-amber-400 font-semibold">
                Hot streak: {profile.current_streak} wins
              </span>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Games Played */}
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Gamepad2 className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Games</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{profile.games_played}</p>
            </div>

            {/* Win Rate */}
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Target className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Win %</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {(profile.win_rate * 100).toFixed(1)}%
              </p>
            </div>

            {/* Total SOL Won */}
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Coins className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">SOL Won</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                {formatSol(Number(profile.total_sol_won))}
              </p>
            </div>

            {/* Biggest Pot */}
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Trophy className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Biggest Pot</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatSol(Number(profile.biggest_pot_won))}
              </p>
            </div>

            {/* Current Streak */}
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Streak</span>
              </div>
              <p className={`text-2xl font-bold ${profile.current_streak > 0 ? 'text-emerald-400' : 'text-foreground'}`}>
                {profile.current_streak}
              </p>
            </div>

            {/* Favorite Game */}
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Favorite</span>
              </div>
              <p className="text-xl font-bold text-foreground truncate">
                {profile.favorite_game ? capitalize(profile.favorite_game) : '—'}
              </p>
            </div>
          </div>

          {/* Recent Games */}
          {recentGames.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
                Recent Games
              </h3>
              <div className="space-y-2">
                {recentGames.map((game, i) => (
                  <div 
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      game.isWin ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                        game.isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {game.isWin ? 'W' : 'L'}
                      </span>
                      <span className="text-foreground font-medium">
                        {capitalize(game.game_type)}
                      </span>
                    </div>
                    <span className="font-mono text-sm text-muted-foreground">
                      {formatSol(game.pot)} SOL
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Longest Streak (if notable) */}
          {profile.longest_streak >= 3 && (
            <p className="text-sm text-muted-foreground text-center pt-2 border-t border-border/30">
              Longest streak: <span className="text-foreground font-semibold">{profile.longest_streak} wins</span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
