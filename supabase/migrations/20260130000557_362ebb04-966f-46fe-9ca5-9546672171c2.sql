-- Lock down game_invites table - only service role (edge functions) can access

-- 1) Ensure RLS is enabled
ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing broken policies
DROP POLICY IF EXISTS "Anyone can create invites" ON public.game_invites;
DROP POLICY IF EXISTS "Recipients can read their invites" ON public.game_invites;
DROP POLICY IF EXISTS "Recipients can update their invites" ON public.game_invites;
DROP POLICY IF EXISTS "Senders can delete their invites" ON public.game_invites;

-- 3) Deny all client access (service role bypasses this)
CREATE POLICY "deny_all_client_access" ON public.game_invites
FOR ALL
TO public
USING (false)
WITH CHECK (false);