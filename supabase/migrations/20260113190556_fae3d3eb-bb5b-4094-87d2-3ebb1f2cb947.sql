-- 1) Ensure RLS is enabled (already enabled, but safe to re-run)
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_acceptances ENABLE ROW LEVEL SECURITY;

-- 2) Remove existing permissive policies (using actual policy names from schema)
DROP POLICY IF EXISTS "Anyone can read game sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "public read" ON public.game_sessions;
DROP POLICY IF EXISTS "public insert" ON public.game_sessions;
DROP POLICY IF EXISTS "Players can insert own acceptances" ON public.game_acceptances;
DROP POLICY IF EXISTS "Players can read own acceptances" ON public.game_acceptances;
DROP POLICY IF EXISTS "public read" ON public.game_acceptances;
DROP POLICY IF EXISTS "public insert" ON public.game_acceptances;

-- 3) Create new restrictive policies for authenticated users only

-- game_sessions: only authenticated users can read
CREATE POLICY "sessions_read_players_only"
ON public.game_sessions
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- game_acceptances: only authenticated users can insert
CREATE POLICY "acceptances_insert_auth_only"
ON public.game_acceptances
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- game_acceptances: only authenticated users can read
CREATE POLICY "acceptances_read_auth_only"
ON public.game_acceptances
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);