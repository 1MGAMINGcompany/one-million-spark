-- Update submit_move with room_pda in UPDATE clause and permission hardening
CREATE OR REPLACE FUNCTION public.submit_move(
  p_session_token text,
  p_room_pda text,
  p_turn_number int,
  p_move_hash text,
  p_prev_hash text,
  p_move_data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_turn int;
  v_last_hash text;
  v_wallet text;
  v_revoked boolean;
BEGIN
  -- Load session FROM player_sessions (authoritative)
  SELECT wallet, revoked, last_turn, last_hash
    INTO v_wallet, v_revoked, v_last_turn, v_last_hash
  FROM player_sessions
  WHERE session_token = p_session_token
    AND room_pda = p_room_pda;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid session';
  END IF;

  IF v_revoked THEN
    RAISE EXCEPTION 'session revoked';
  END IF;

  -- Monotonic turn enforcement
  IF p_turn_number <> v_last_turn + 1 THEN
    RAISE EXCEPTION 'bad turn number';
  END IF;

  -- Hash chain enforcement
  IF p_prev_hash <> v_last_hash THEN
    RAISE EXCEPTION 'bad prev hash';
  END IF;

  -- Store move (PK prevents duplicates)
  INSERT INTO game_moves(room_pda, turn_number, wallet, move_hash, prev_hash, move_data)
  VALUES (p_room_pda, p_turn_number, v_wallet, p_move_hash, p_prev_hash, p_move_data);

  -- Advance session state (now includes room_pda for safety)
  UPDATE player_sessions
  SET last_turn = p_turn_number,
      last_hash = p_move_hash
  WHERE session_token = p_session_token
    AND room_pda = p_room_pda;
END;
$$;

-- Lock down permissions
REVOKE ALL ON FUNCTION public.submit_move(text, text, int, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_move(text, text, int, text, text, jsonb) TO anon, authenticated;