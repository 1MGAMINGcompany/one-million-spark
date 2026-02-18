

# Security Hardening: Force RLS + Revoke Client Grants

Apply a single database migration to lock down `game_sessions`, `game_acceptances`, and `settlement_logs` against any client-side access.

## What Changes

Three tables currently have RLS enabled but no policies and overly broad grants to `anon`/`authenticated`. This migration will:

1. **FORCE ROW LEVEL SECURITY** on all three tables (prevents bypass even by table owners)
2. **REVOKE ALL privileges** from `anon` and `authenticated` roles
3. **Explicitly GRANT** SELECT/INSERT/UPDATE/DELETE to `service_role` (edge functions keep working)
4. **Add deny-all policies** (`USING (false) WITH CHECK (false)`) for lint clarity

## Why This Is Safe

- All client access already goes through Edge Functions (service role) or SECURITY DEFINER RPCs
- Realtime subscriptions use replication-level access and are unaffected by RLS/grants
- Zero direct `supabase.from('game_sessions').select()` calls exist in client code (verified in prior audit)

## Technical Details

A single SQL migration containing:

```sql
-- Step 1: Force RLS
ALTER TABLE public.game_sessions     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.game_acceptances  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_logs   FORCE ROW LEVEL SECURITY;

-- Step 2: Revoke client access
REVOKE ALL ON TABLE public.game_sessions     FROM anon, authenticated;
REVOKE ALL ON TABLE public.game_acceptances  FROM anon, authenticated;
REVOKE ALL ON TABLE public.settlement_logs   FROM anon, authenticated;

-- Step 3: Ensure service_role retains access
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_sessions     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_acceptances  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settlement_logs   TO service_role;

-- Step 4: Explicit deny policies (idempotent)
DO $$ ... CREATE POLICY deny_all_clients ... $$;
```

No code file changes needed -- this is a database-only migration.

