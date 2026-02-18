
-- Step 1: Force RLS (prevents bypass even by table owners)
ALTER TABLE public.game_sessions     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.game_acceptances  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_logs   FORCE ROW LEVEL SECURITY;

-- Step 2: Revoke ALL privileges from client roles
REVOKE ALL ON TABLE public.game_sessions     FROM anon, authenticated;
REVOKE ALL ON TABLE public.game_acceptances  FROM anon, authenticated;
REVOKE ALL ON TABLE public.settlement_logs   FROM anon, authenticated;

-- Step 3: Ensure service_role retains full access
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_sessions     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_acceptances  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settlement_logs   TO service_role;

-- Step 4: Explicit deny-all policies (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_sessions' AND policyname='deny_all_clients'
  ) THEN
    CREATE POLICY deny_all_clients ON public.game_sessions
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_acceptances' AND policyname='deny_all_clients'
  ) THEN
    CREATE POLICY deny_all_clients ON public.game_acceptances
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='settlement_logs' AND policyname='deny_all_clients'
  ) THEN
    CREATE POLICY deny_all_clients ON public.settlement_logs
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
