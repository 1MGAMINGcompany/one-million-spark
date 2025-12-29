-- Add desync counter to player_sessions
ALTER TABLE player_sessions
ADD COLUMN IF NOT EXISTS desync_count int NOT NULL DEFAULT 0;

-- Create report_desync function with threshold revocation
CREATE OR REPLACE FUNCTION public.report_desync(
  p_session_token text,
  p_room_pda text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE player_sessions
  SET desync_count = desync_count + 1
  WHERE session_token = p_session_token
    AND room_pda = p_room_pda
    AND revoked = false
  RETURNING desync_count INTO v_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid session';
  END IF;

  -- Soft threshold: revoke after 5 desync events
  IF v_count >= 5 THEN
    UPDATE player_sessions
    SET revoked = true
    WHERE session_token = p_session_token
      AND room_pda = p_room_pda;
  END IF;
END;
$$;

-- Permission hardening
REVOKE ALL ON FUNCTION public.report_desync(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.report_desync(text, text) TO anon, authenticated;