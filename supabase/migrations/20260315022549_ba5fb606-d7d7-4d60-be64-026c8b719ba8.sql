CREATE TABLE public.leaderboard_cache (
  wallet text NOT NULL,
  category text NOT NULL,
  period text NOT NULL DEFAULT 'all_time',
  total_entries integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  total_sol_played numeric NOT NULL DEFAULT 0,
  total_sol_won numeric NOT NULL DEFAULT 0,
  net_sol numeric NOT NULL DEFAULT 0,
  win_rate real,
  rank integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, category, period)
);

ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_leaderboard_cache" ON public.leaderboard_cache
  FOR SELECT TO public USING (true);

CREATE POLICY "deny_client_writes_leaderboard_cache" ON public.leaderboard_cache
  FOR ALL TO public USING (false) WITH CHECK (false);