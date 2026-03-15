import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Loader2, Crown, Medal, Award, RefreshCw, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CacheEntry {
  wallet: string;
  category: string;
  period: string;
  total_entries: number;
  wins: number;
  losses: number;
  total_sol_played: number;
  total_sol_won: number;
  net_sol: number;
  win_rate: number | null;
  rank: number | null;
  updated_at: string;
}

function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const PERIOD_OPTIONS = [
  { value: 'all_time', label: 'All Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
];

interface Props {
  category: 'predictions' | 'combined';
  connectedWallet: string | undefined;
  isConnected: boolean;
  isAdmin: boolean;
  showTimeFilter?: boolean;
}

export default function CachedLeaderboard({
  category,
  connectedWallet,
  isConnected,
  isAdmin,
  showTimeFilter = true,
}: Props) {
  const [period, setPeriod] = useState('all_time');
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [userEntry, setUserEntry] = useState<CacheEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const activePeriod = showTimeFilter ? period : 'all_time';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.from as any)('leaderboard_cache')
        .select('*')
        .eq('category', category)
        .eq('period', activePeriod)
        .order('rank', { ascending: true })
        .limit(50);

      if (error) {
        console.error('[CachedLeaderboard] Fetch error:', error);
        setEntries([]);
      } else {
        setEntries((data as CacheEntry[]) || []);
      }

      if (isConnected && connectedWallet) {
        const { data: userData } = await (supabase.from as any)('leaderboard_cache')
          .select('*')
          .eq('category', category)
          .eq('period', activePeriod)
          .eq('wallet', connectedWallet)
          .maybeSingle();
        setUserEntry(userData as CacheEntry | null);
      } else {
        setUserEntry(null);
      }
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [category, activePeriod, isConnected, connectedWallet]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    if (!connectedWallet) return;
    setRefreshing(true);
    try {
      const { data } = await supabase.functions.invoke('rebuild-leaderboard', {
        body: { adminWallet: connectedWallet },
      });
      if (data?.success) {
        toast.success(`Leaderboard refreshed (${data.rows_written} entries)`);
        fetchData();
      } else {
        toast.error(data?.error || 'Refresh failed');
      }
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground font-mono w-5 text-center">{rank}</span>;
  };

  const categoryLabel = category === 'predictions' ? 'Predictions' : 'Combined';
  const userInTop50 = entries.some((e) => e.wallet === connectedWallet);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading {categoryLabel} leaderboard…</span>
      </div>
    );
  }

  return (
    <>
      {/* User summary card */}
      {isConnected && userEntry && (
        <Card className="border-border/50 bg-card/80 backdrop-blur mb-4 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Your Rank</p>
                  <p className="text-2xl font-bold">#{userEntry.rank}</p>
                </div>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">Wins</p>
                  <p className="text-lg font-bold text-emerald-400">{userEntry.wins}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className="text-lg font-bold">
                    {userEntry.win_rate != null ? `${Math.round(userEntry.win_rate * 100)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net SOL</p>
                  <p className={`text-lg font-bold ${userEntry.net_sol >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {userEntry.net_sol >= 0 ? '+' : ''}{userEntry.net_sol.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-b border-border/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Trophy className="h-6 w-6 text-primary" />
                {categoryLabel} Leaderboard
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Top 50 by net SOL</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {showTimeFilter && (
                <div className="flex gap-1">
                  {PERIOD_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={period === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPeriod(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No data yet</h3>
              <p className="text-muted-foreground">
                {category === 'predictions'
                  ? 'Make predictions on upcoming events to appear here!'
                  : 'Play skill games or make predictions to climb the ranks.'}
              </p>
              {isAdmin && (
                <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Build Leaderboard
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold bg-muted/30">
                <div className="col-span-1">#</div>
                <div className="col-span-3">Player</div>
                <div className="col-span-2">Wins</div>
                <div className="col-span-3">Win Rate</div>
                <div className="col-span-3 text-right">Net SOL</div>
              </div>

              {entries.map((entry) => {
                const isYou = isConnected && connectedWallet === entry.wallet;
                const isTopThree = (entry.rank || 0) <= 3;

                return (
                  <div
                    key={entry.wallet}
                    className={`grid grid-cols-12 gap-2 px-4 py-3 items-center transition-colors hover:bg-muted/20 ${
                      isYou ? 'bg-primary/10 border-l-2 border-l-primary'
                        : isTopThree ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="col-span-1 flex items-center">
                      {getRankBadge(entry.rank || 0)}
                    </div>
                    <div className="col-span-3 flex items-center gap-1.5">
                      <Link
                        to={`/player/${entry.wallet}`}
                        className={`font-mono text-sm underline-offset-2 hover:underline ${
                          isYou ? 'text-primary font-semibold' : 'text-foreground hover:text-primary'
                        }`}
                      >
                        {shortenWallet(entry.wallet)}
                      </Link>
                      {isYou && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">You</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className="text-emerald-400 font-bold">{entry.wins}</span>
                      <span className="text-muted-foreground">/{entry.total_entries}</span>
                    </div>
                    <div className="col-span-3">
                      <span className="font-semibold">
                        {entry.win_rate != null ? `${Math.round(entry.win_rate * 100)}%` : '—'}
                      </span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className={`font-bold ${entry.net_sol >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {entry.net_sol >= 0 ? '+' : ''}{entry.net_sol.toFixed(3)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Show user row at bottom if not in top 50 */}
              {isConnected && userEntry && !userInTop50 && (
                <>
                  <div className="px-4 py-2 text-center text-xs text-muted-foreground bg-muted/20">···</div>
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-primary/10 border-l-2 border-l-primary">
                    <div className="col-span-1 flex items-center">
                      <span className="text-muted-foreground font-mono w-5 text-center">{userEntry.rank}</span>
                    </div>
                    <div className="col-span-3 flex items-center gap-1.5">
                      <span className="font-mono text-sm text-primary font-semibold">
                        {shortenWallet(userEntry.wallet)}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">You</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-emerald-400 font-bold">{userEntry.wins}</span>
                      <span className="text-muted-foreground">/{userEntry.total_entries}</span>
                    </div>
                    <div className="col-span-3">
                      <span className="font-semibold">
                        {userEntry.win_rate != null ? `${Math.round(userEntry.win_rate * 100)}%` : '—'}
                      </span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className={`font-bold ${userEntry.net_sol >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {userEntry.net_sol >= 0 ? '+' : ''}{userEntry.net_sol.toFixed(3)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
