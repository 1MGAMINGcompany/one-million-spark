-- Lock tables completely to prevent spoofing (wallet-only apps must use Edge Functions)

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_acceptances ENABLE ROW LEVEL SECURITY;

-- Remove any existing permissive policies
DROP POLICY IF EXISTS "sessions_read_players_only" ON public.game_sessions;
DROP POLICY IF EXISTS "acceptances_insert_auth_only" ON public.game_acceptances;
DROP POLICY IF EXISTS "acceptances_read_auth_only" ON public.game_acceptances;

DROP POLICY IF EXISTS "public read" ON public.game_sessions;
DROP POLICY IF EXISTS "public insert" ON public.game_sessions;
DROP POLICY IF EXISTS "public read" ON public.game_acceptances;
DROP POLICY IF EXISTS "public insert" ON public.game_acceptances;

-- No policies = no access from anon/authenticated clients
-- (Edge Functions using service role key still work)