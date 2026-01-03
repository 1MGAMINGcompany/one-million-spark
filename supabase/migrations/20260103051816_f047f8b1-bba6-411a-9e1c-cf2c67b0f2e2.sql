-- Defensive RLS policies for security-sensitive tables
-- All access goes through SECURITY DEFINER RPCs, these block accidental direct queries

-- player_sessions: keep private, RPC-only access
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_sessions_select_none" ON public.player_sessions;
CREATE POLICY "player_sessions_select_none"
ON public.player_sessions
FOR SELECT
USING (false);

-- session_nonces: keep private, RPC-only access
ALTER TABLE public.session_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_nonces_select_none" ON public.session_nonces;
CREATE POLICY "session_nonces_select_none"
ON public.session_nonces
FOR SELECT
USING (false);

-- game_moves: keep private, RPC-only access
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_moves_select_none" ON public.game_moves;
CREATE POLICY "game_moves_select_none"
ON public.game_moves
FOR SELECT
USING (false);