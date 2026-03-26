/**
 * Public Player Profile Page
 * Fighter-record style layout - no login, no edit, just facts
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { ArrowLeft, Flame, Trophy, Target, Coins, Zap, Gamepad2, TrendingUp, Loader2, Palette, Share2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { RecoverableRoomsSection } from '@/components/RecoverableRoomsSection';
import ReferralSection from '@/components/ReferralSection';
import { CHESS_SKINS } from '@/lib/chessSkins';
import SocialShareModal from '@/components/SocialShareModal';
import type { ShareVariant } from '@/components/SocialShareModal';
import profileBanner from '@/assets/profile-banner.jpg';

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

interface RatingData {
  game_type: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
}

interface RecentGame {
  game_type: string;
  isWin: boolean;
  pot: number;
  finalized_at: string;
}

interface PredictionEntry {
  id: string;
  fight_id: string;
  fighter_pick: string;
  amount_usd: number | null;
  reward_usd: number | null;
  claimed: boolean;
  created_at: string;
  prediction_fights: {
    title: string;
    fighter_a_name: string;
    fighter_b_name: string;
    status: string;
    winner: string | null;
    event_name: string;
  } | null;
}

// Shorten wallet for display
function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// Format USDC with max 2 decimals
function formatUsdc(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

// Capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// High Roller threshold in USDC
const HIGH_ROLLER_THRESHOLD = 50;

// Get player title (highest priority wins)
function getPlayerTitle(profile: PlayerProfileData): { title: string; color: string } | null {
  if (profile.current_streak >= 5) {
    return { title: 'Unstoppable', color: 'text-purple-400' };
  }
  if (profile.current_streak >= 3) {
    return { title: 'Hot Hand', color: 'text-amber-400' };
  }
  if (profile.favorite_game && profile.win_rate >= 0.6 && profile.games_played >= 5) {
    const game = capitalize(profile.favorite_game);
    return { title: `${game} Shark`, color: 'text-cyan-400' };
  }
  if (Number(profile.biggest_pot_won) >= HIGH_ROLLER_THRESHOLD) {
    return { title: 'High Roller', color: 'text-emerald-400' };
  }
  if (profile.games_played >= 50) {
    return { title: 'Veteran', color: 'text-blue-400' };
  }
  if (profile.games_played < 10) {
    return { title: 'New Challenger', color: 'text-muted-foreground' };
  }
  return null;
}

// Tier thresholds with subtiers
const TIER_CONFIG = [
  { name: 'Grandmaster', min: 1700, color: 'text-purple-400', emoji: '👑' },
  { name: 'Diamond', min: 1500, color: 'text-cyan-300', emoji: '💎' },
  { name: 'Gold', min: 1300, color: 'text-amber-400', emoji: '🥇' },
  { name: 'Silver', min: 1100, color: 'text-slate-300', emoji: '🥈' },
  { name: 'Bronze', min: 0, color: 'text-amber-600', emoji: '🥉' },
] as const;

function getSubtier(rating: number, tierMin: number, tierMax: number): string {
  const range = tierMax - tierMin;
  const position = rating - tierMin;
  const third = range / 3;
  if (position >= third * 2) return 'III';
  if (position >= third) return 'II';
  return 'I';
}

function getRankTier(rating: number) {
  for (let i = 0; i < TIER_CONFIG.length; i++) {
    const tier = TIER_CONFIG[i];
    if (rating >= tier.min) {
      const nextTierMin = i === 0 ? Infinity : TIER_CONFIG[i - 1].min;
      if (tier.name === 'Grandmaster') {
        return { tier: tier.name, subtier: '', fullTier: tier.name, color: tier.color, emoji: tier.emoji, nextTierThreshold: null, pointsToNext: 0 };
      }
      const subtier = getSubtier(rating, tier.min, nextTierMin);
      const tierRange = nextTierMin - tier.min;
      const subtierSize = tierRange / 3;
      let nextThreshold: number;
      if (subtier === 'I') nextThreshold = tier.min + subtierSize;
      else if (subtier === 'II') nextThreshold = tier.min + subtierSize * 2;
      else nextThreshold = nextTierMin;
      return { tier: tier.name, subtier, fullTier: `${tier.name} ${subtier}`, color: tier.color, emoji: tier.emoji, nextTierThreshold: Math.round(nextThreshold), pointsToNext: Math.max(0, Math.round(nextThreshold) - rating) };
    }
  }
  return { tier: 'Bronze', subtier: 'I', fullTier: 'Bronze I', color: 'text-amber-600', emoji: '🥉', nextTierThreshold: 67, pointsToNext: 67 };
}

function getOneWinAwayMessage(rank: ReturnType<typeof getRankTier>): string | null {
  if (rank.nextTierThreshold === null || rank.pointsToNext > 15) return null;
  if (rank.subtier === 'III') {
    const tierIndex = TIER_CONFIG.findIndex(t => t.name === rank.tier);
    if (tierIndex > 0) return `One win away from ${TIER_CONFIG[tierIndex - 1].name}!`;
  } else if (rank.subtier === 'II') return `One win away from ${rank.tier} III!`;
  else if (rank.subtier === 'I') return `One win away from ${rank.tier} II!`;
  return null;
}

interface Badge { id: string; label: string; icon: string; color: string; }

function getPlayerBadges(profile: PlayerProfileData): Badge[] {
  const badges: Badge[] = [];
  if (profile.current_streak >= 3) badges.push({ id: 'hot-streak', label: 'Hot Streak', icon: '🔥', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' });
  if (Number(profile.total_sol_won) >= 100) badges.push({ id: 'big-winner', label: 'Big Winner', icon: '💰', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' });
  if (profile.win_rate >= 0.65 && profile.games_played >= 10) badges.push({ id: 'strategy-master', label: 'Strategy Master', icon: '🧠', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' });
  return badges.slice(0, 3);
}

function getPredictionStatus(entry: PredictionEntry): { label: string; color: string } {
  const fight = entry.prediction_fights;
  if (!fight) return { label: 'Unknown', color: 'text-muted-foreground' };
  if (fight.status === 'settled' || fight.status === 'closed') {
    if (fight.winner === entry.fighter_pick) return { label: 'Won', color: 'text-emerald-400' };
    return { label: 'Lost', color: 'text-red-400' };
  }
  return { label: 'Open', color: 'text-primary' };
}

export default function PlayerProfile() {
  const { wallet } = useParams<{ wallet: string }>();
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const { walletAddress: privyEvmAddress } = usePrivyWallet();
  const isOwnProfile = (publicKey && wallet === publicKey.toBase58()) || (privyEvmAddress && wallet?.toLowerCase() === privyEvmAddress.toLowerCase());

  const [profile, setProfile] = useState<PlayerProfileData | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [ratings, setRatings] = useState<RatingData[]>([]);
  const [predictions, setPredictions] = useState<PredictionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileCopied, setProfileCopied] = useState(false);

  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEntry, setShareEntry] = useState<PredictionEntry | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!wallet) { setError('No wallet specified'); setLoading(false); return; }
      // Normalize EVM addresses to lowercase (DB stores lowercase, URLs have checksummed case)
      const queryWallet = wallet.startsWith('0x') ? wallet.toLowerCase() : wallet;

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('player_profiles').select('*').eq('wallet', queryWallet).maybeSingle();

        if (profileError) { setError('Failed to load profile'); setLoading(false); return; }

        if (!profileData) {
          // No Solana profile — check if this wallet has prediction entries (EVM user)
          const { count } = await supabase
            .from('prediction_entries')
            .select('id', { count: 'exact', head: true })
            .eq('wallet', queryWallet);

          if (count && count > 0) {
            // Shell profile so the page renders with predictions section
            setProfile({
              wallet,
              games_played: 0, wins: 0, losses: 0, win_rate: 0,
              total_sol_won: 0, biggest_pot_won: 0,
              current_streak: 0, longest_streak: 0,
              favorite_game: null, last_game_at: null,
            });
          } else {
            setError('Player not found');
            setLoading(false);
            return;
          }
        } else {
          setProfile(profileData);
        }

        // Fetch recent games, ratings, and predictions in parallel
        const [matchesRes, ratingsRes, predictionsRes] = await Promise.all([
          supabase.from('matches')
            .select('game_type, winner_wallet, stake_lamports, max_players, finalized_at')
            .eq('status', 'finalized')
            .or(`creator_wallet.eq.${queryWallet},winner_wallet.eq.${queryWallet}`)
            .order('finalized_at', { ascending: false }).limit(5),
          supabase.from('ratings')
            .select('game_type, rating, games, wins, losses')
            .eq('wallet', queryWallet).order('games', { ascending: false }),
          supabase.from('prediction_entries')
            .select('id, fight_id, fighter_pick, amount_usd, reward_usd, claimed, created_at, prediction_fights(title, fighter_a_name, fighter_b_name, status, winner, event_name)')
            .eq('wallet', queryWallet).order('created_at', { ascending: false }).limit(20),
        ]);

        if (matchesRes.data) {
          setRecentGames(matchesRes.data.map(m => ({
            game_type: m.game_type,
            isWin: m.winner_wallet === wallet,
            pot: (Number(m.stake_lamports) * (m.max_players || 2)) / 1_000_000_000,
            finalized_at: m.finalized_at || '',
          })));
        }
        if (ratingsRes.data) setRatings(ratingsRes.data);
        if (predictionsRes.data) {
          // The join returns prediction_fights as an object (single) not array
          setPredictions(predictionsRes.data as unknown as PredictionEntry[]);
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

  const handleShareProfile = () => {
    const url = `${window.location.origin}/profile/${wallet}`;
    if (navigator.share) {
      navigator.share({ title: '1MGAMING Player Profile', url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setProfileCopied(true);
        setTimeout(() => setProfileCopied(false), 2000);
      });
    }
  };

  const openPredictionShare = (entry: PredictionEntry) => {
    setShareEntry(entry);
    setShareOpen(true);
  };

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
            <p className="text-muted-foreground">This player hasn't competed in any games yet.</p>
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
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShareProfile}>
          {profileCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
          {profileCopied ? 'Copied!' : 'Share Profile'}
        </Button>
      </div>

      {/* Banner */}
      <div className="mb-4 rounded-xl overflow-hidden">
        <img src={profileBanner} alt="1M Gaming — Who Wins?" className="w-full h-auto object-cover" />
      </div>

      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        {/* Header - Fighter Record Style */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 border-b border-border/30">
          <p className="font-mono text-muted-foreground text-sm mb-1">{shortenWallet(profile.wallet)}</p>
          {playerTitle && (
            <p className={`text-sm font-semibold uppercase tracking-wide mb-2 ${playerTitle.color}`}>{playerTitle.title}</p>
          )}
          <div className="flex items-baseline gap-3">
            <span className="text-muted-foreground text-lg">Record:</span>
            <span className="text-4xl font-bold text-foreground">
              <span className="text-emerald-400">{profile.wins}</span>
              <span className="text-muted-foreground mx-2">–</span>
              <span className="text-red-400">{profile.losses}</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{profile.games_played} game{profile.games_played !== 1 ? 's' : ''} played</p>

          {playerBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {playerBadges.map((badge) => (
                <span key={badge.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
                  <span>{badge.icon}</span>{badge.label}
                </span>
              ))}
            </div>
          )}

          {ratings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Ranked Ratings</p>
              <div className="flex flex-wrap gap-3">
                {ratings.map((r) => {
                  const rank = getRankTier(r.rating);
                  const oneWinAway = getOneWinAwayMessage(rank);
                  return (
                    <div key={r.game_type} className="bg-muted/40 rounded-lg px-3 py-2 min-w-[140px]">
                      <p className="text-xs text-muted-foreground capitalize">{r.game_type}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-foreground">{r.rating}</span>
                        <span className={`text-xs font-semibold ${rank.color}`}>{rank.emoji} {rank.fullTier}</span>
                      </div>
                      {oneWinAway && <p className="text-xs text-emerald-400 font-medium mt-1 animate-pulse">🎯 {oneWinAway}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ratings.length === 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-sm text-muted-foreground">🎮 <span className="text-foreground">Unrated</span> — Play a ranked match to get a rating</p>
            </div>
          )}
        </div>

        <CardContent className="p-6 space-y-6">
          {hasHotStreak && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <Flame className="h-5 w-5 text-amber-400" />
              <span className="text-amber-400 font-semibold">Hot streak: {profile.current_streak} wins</span>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1"><Gamepad2 className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Games</span></div>
              <p className="text-2xl font-bold text-foreground">{profile.games_played}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1"><Target className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Win %</span></div>
              <p className="text-2xl font-bold text-foreground">{(profile.win_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1"><Coins className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">USDC Won</span></div>
              <p className="text-2xl font-bold text-primary">{formatUsdc(Number(profile.total_sol_won))}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1"><Trophy className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Biggest Pot</span></div>
              <p className="text-2xl font-bold text-foreground">{formatUsdc(Number(profile.biggest_pot_won))}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1"><Zap className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Streak</span></div>
              <p className={`text-2xl font-bold ${profile.current_streak > 0 ? 'text-emerald-400' : 'text-foreground'}`}>{profile.current_streak}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Favorite</span></div>
              <p className="text-xl font-bold text-foreground truncate">{profile.favorite_game ? capitalize(profile.favorite_game) : '—'}</p>
            </div>
            {isOwnProfile && (() => {
              const games = (() => { try { return parseInt(localStorage.getItem('chess-games-completed') || '0', 10) || 0; } catch { return 0; } })();
              const shares = (() => { try { return parseInt(localStorage.getItem('chess-shares-count') || '0', 10) || 0; } catch { return 0; } })();
              const unlocked = CHESS_SKINS.filter(s => games >= s.unlockGames && shares >= s.unlockShares).length;
              return (
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1"><Palette className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Skins</span></div>
                  <p className="text-2xl font-bold text-foreground">{unlocked}<span className="text-muted-foreground text-base font-normal"> / {CHESS_SKINS.length}</span></p>
                </div>
              );
            })()}
          </div>

          {/* My Predictions Section */}
          {predictions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
                🥊 My Predictions
              </h3>
              <div className="space-y-2">
                {predictions.map((entry) => {
                  const fight = entry.prediction_fights;
                  const status = getPredictionStatus(entry);
                  const isWon = status.label === 'Won';
                  return (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-lg border ${
                        isWon ? 'bg-emerald-500/10 border-emerald-500/20' :
                        status.label === 'Lost' ? 'bg-red-500/10 border-red-500/20' :
                        'bg-primary/5 border-primary/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {fight?.title || 'Unknown Fight'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Picked: <span className="font-medium text-foreground">{entry.fighter_pick}</span>
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            {entry.amount_usd != null && (
                              <span className="text-xs text-muted-foreground">
                                ${entry.amount_usd.toFixed(2)}
                              </span>
                            )}
                            <span className={`text-xs font-bold ${status.color}`}>
                              {status.label}
                            </span>
                            {isWon && entry.reward_usd != null && (
                              <span className="text-xs font-bold text-emerald-400">
                                +${entry.reward_usd.toFixed(2)}
                              </span>
                            )}
                            {isWon && entry.claimed && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                                Claimed
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-8 w-8 p-0"
                          onClick={() => openPredictionShare(entry)}
                          title="Share prediction"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Games */}
          {recentGames.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Recent Games</h3>
              <div className="space-y-2">
                {recentGames.map((game, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${game.isWin ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${game.isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{game.isWin ? 'W' : 'L'}</span>
                      <span className="text-foreground font-medium">{capitalize(game.game_type)}</span>
                    </div>
                    <span className="font-mono text-sm text-muted-foreground">{formatUsdc(game.pot)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profile.longest_streak >= 3 && (
            <p className="text-sm text-muted-foreground text-center pt-2 border-t border-border/30">
              Longest streak: <span className="text-foreground font-semibold">{profile.longest_streak} wins</span>
            </p>
          )}
        </CardContent>
      </Card>

      {isOwnProfile && wallet && <ReferralSection wallet={wallet} />}
      {isOwnProfile && wallet && <RecoverableRoomsSection wallet={wallet} />}

      {/* Share modal for prediction entries */}
      {shareEntry && (
        <SocialShareModal
          open={shareOpen}
          onClose={() => { setShareOpen(false); setShareEntry(null); }}
          variant={getPredictionStatus(shareEntry).label === 'Won' ? 'claim_win' : 'prediction'}
          eventTitle={shareEntry.prediction_fights?.title}
          sport={shareEntry.prediction_fights?.event_name}
          fighterPick={shareEntry.fighter_pick}
          amountUsd={shareEntry.amount_usd ?? undefined}
          amountWon={getPredictionStatus(shareEntry).label === 'Won' ? (shareEntry.reward_usd ?? undefined) : undefined}
          wallet={wallet}
        />
      )}
    </div>
  );
}
