import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, Loader2, Crown, Medal, Award, Target, TrendingUp } from 'lucide-react';
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
      if (tier.name === 'Grandmaster') return { fullTier: tier.name, color: tier.color, emoji: tier.emoji };
      const nextTierMin = i === 0 ? Infinity : TIER_CONFIG[i - 1].min;
      const subtier = getSubtier(rating, tier.min, nextTierMin);
      return { fullTier: `${tier.name} ${subtier}`, color: tier.color, emoji: tier.emoji };
    }
  }
  return { fullTier: 'Bronze I', color: 'text-amber-600', emoji: '🥉' };
}

function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const VALID_GAMES = ['ludo', 'dominos', 'chess', 'backgammon', 'checkers'];

interface Props {
  gameType: string;
  connectedWallet: string | undefined;
  isConnected: boolean;
}

export default function SkillGameBoard({ gameType, connectedWallet, isConnected }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRating, setUserRating] = useState<LeaderboardEntry | null>(null);
  const [userGlobalRank, setUserGlobalRank] = useState<number | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isValidGame = VALID_GAMES.includes(gameType);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);

      if (!isValidGame) {
        setError(`Invalid game type: ${gameType}`);
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
          setError('Failed to load leaderboard');
          return;
        }

        setEntries(data || []);

        const { count } = await supabase
          .from('ratings')
          .select('*', { count: 'exact', head: true })
          .eq('game_type', gameType);

        setTotalPlayers(count || 0);

        if (isConnected && connectedWallet) {
          const { data: userData } = await supabase
            .from('ratings')
            .select('wallet, rating, games, wins, losses')
            .eq('game_type', gameType)
            .eq('wallet', connectedWallet)
            .maybeSingle();

          if (userData) {
            setUserRating(userData);
            const { count: higherCount } = await supabase
              .from('ratings')
              .select('*', { count: 'exact', head: true })
              .eq('game_type', gameType)
              .gt('rating', userData.rating);
            setUserGlobalRank((higherCount || 0) + 1);
          } else {
            setUserRating(null);
            setUserGlobalRank(null);
          }
        }
      } catch {
        setError('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [gameType, isValidGame, isConnected, connectedWallet]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground font-mono w-5 text-center">{rank}</span>;
  };

  const getNextTarget = () => {
    if (!userRating || userGlobalRank === null || userGlobalRank <= 1) return null;
    const targetRank = userGlobalRank - 1;
    const playerAbove = entries.find((_, idx) => idx + 1 === targetRank);
    if (playerAbove && playerAbove.rating > userRating.rating) {
      return { targetRank, pointsNeeded: playerAbove.rating - userRating.rating + 1 };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">{t("leaderboard.loadingLeaderboard")}</span>
      </div>
    );
  }

  if (error || !isValidGame) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardContent className="text-center py-12">
          <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold mb-2">{error || t("leaderboard.invalidGame")}</h3>
          <p className="text-muted-foreground mb-4">{t("leaderboard.chooseGame")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {VALID_GAMES.map((g) => (
              <Button key={g} variant="outline" size="sm" onClick={() => navigate(`/leaderboard/${g}`)}>
                {capitalize(g)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const userRank = userRating ? getRankTier(userRating.rating) : null;
  const nextTarget = getNextTarget();

  return (
    <>
      {/* Your Rank Summary */}
      {isConnected && (
        <Card className="border-border/50 bg-card/80 backdrop-blur mb-4 overflow-hidden">
          <CardContent className="p-4">
            {userRating && userRank ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("leaderboard.yourRating")}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{userRating.rating}</span>
                      <span className={`text-sm font-semibold ${userRank.color}`}>
                        {userRank.emoji} {userRank.fullTier}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t("leaderboard.yourRank")}</p>
                  <p className="text-xl font-bold">
                    #{userGlobalRank} <span className="text-sm font-normal text-muted-foreground">{t("leaderboard.of")} {totalPlayers}</span>
                  </p>
                </div>
                {nextTarget && userGlobalRank && userGlobalRank > 1 && (
                  <div className="w-full pt-3 border-t border-border/30">
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <span className="text-muted-foreground">{t("leaderboard.nextTarget")}</span>
                      <span className="text-foreground font-medium">#{nextTarget.targetRank}</span>
                      <span className="text-emerald-400 font-medium">
                        ({t("leaderboard.need", { points: nextTarget.pointsNeeded })})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                  <Target className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-foreground font-medium">{t("leaderboard.unrated")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("leaderboard.winRankedToJoin", { game: capitalize(gameType) })}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-b border-border/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Trophy className="h-6 w-6 text-primary" />
                {t("leaderboard.title", { game: capitalize(gameType) })}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{t("leaderboard.top50")}</p>
            </div>
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
              <h3 className="text-lg font-semibold mb-2">{t("leaderboard.noPlayers")}</h3>
              <p className="text-muted-foreground">
                {t("leaderboard.beFirst", { game: capitalize(gameType) })}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold bg-muted/30">
                <div className="col-span-1">#</div>
                <div className="col-span-4">{t("leaderboard.player")}</div>
                <div className="col-span-3">{t("leaderboard.rating")}</div>
                <div className="col-span-4 text-right">{t("leaderboard.record")}</div>
              </div>

              {entries.map((entry, index) => {
                const rank = getRankTier(entry.rating);
                const position = index + 1;
                const isTopThree = position <= 3;
                const isYou = isConnected && connectedWallet === entry.wallet;

                return (
                  <div
                    key={entry.wallet}
                    className={`grid grid-cols-12 gap-2 px-4 py-3 items-center transition-colors hover:bg-muted/20 ${
                      isYou ? 'bg-primary/10 border-l-2 border-l-primary'
                        : isTopThree ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="col-span-1 flex items-center">{getRankBadge(position)}</div>
                    <div className="col-span-4 flex items-center gap-2">
                      <Link
                        to={`/player/${entry.wallet}`}
                        className={`font-mono text-sm transition-colors underline-offset-2 hover:underline ${
                          isYou ? 'text-primary font-semibold' : 'text-foreground hover:text-primary'
                        }`}
                      >
                        {shortenWallet(entry.wallet)}
                      </Link>
                      {isYou && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                          {t("leaderboard.you")}
                        </span>
                      )}
                    </div>
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${isYou ? 'text-primary' : 'text-foreground'}`}>{entry.rating}</span>
                        <span className={`text-xs ${rank.color}`}>{rank.emoji}</span>
                      </div>
                      <p className={`text-xs ${rank.color}`}>{rank.fullTier}</p>
                    </div>
                    <div className="col-span-4 text-right">
                      <span className="font-semibold">
                        <span className="text-emerald-400">{entry.wins}</span>
                        <span className="text-muted-foreground mx-1">–</span>
                        <span className="text-red-400">{entry.losses}</span>
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {entry.games === 1 ? t("leaderboard.games", { count: 1 }) : t("leaderboard.gamesPlural", { count: entry.games })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
