-- RPC: revoke_session to invalidate session tokens
CREATE OR REPLACE FUNCTION public.revoke_session(
  p_session_token text,
  p_room_pda text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE player_sessions
  SET revoked = true
  WHERE session_token = p_session_token
    AND room_pda = p_room_pda;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;
END;
$$;

-- Grant execute to anon and authenticated
REVOKE ALL ON FUNCTION public.revoke_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_session(text, text) TO anon, authenticated;