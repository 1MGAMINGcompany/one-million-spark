-- Add rate limit tracking column
ALTER TABLE player_sessions
ADD COLUMN IF NOT EXISTS last_move_at timestamptz;

-- Update submit_move with rate limiting
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
  v_last_move_at timestamptz;
BEGIN
  SELECT wallet, revoked, last_turn, last_hash, last_move_at
    INTO v_wallet, v_revoked, v_last_turn, v_last_hash, v_last_move_at
  FROM player_sessions
  WHERE session_token = p_session_token
    AND room_pda = p_room_pda;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid session';
  END IF;

  IF v_revoked THEN
    RAISE EXCEPTION 'session revoked';
  END IF;

  -- Soft rate limit: 150ms minimum between moves
  IF v_last_move_at IS NOT NULL AND now() - v_last_move_at < interval '150 milliseconds' THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  IF p_turn_number <> v_last_turn + 1 THEN
    RAISE EXCEPTION 'bad turn number';
  END IF;

  IF p_prev_hash <> v_last_hash THEN
    RAISE EXCEPTION 'bad prev hash';
  END IF;

  INSERT INTO game_moves(room_pda, turn_number, wallet, move_hash, prev_hash, move_data)
  VALUES (p_room_pda, p_turn_number, v_wallet, p_move_hash, p_prev_hash, p_move_data);

  UPDATE player_sessions
  SET last_turn = p_turn_number,
      last_hash = p_move_hash,
      last_move_at = now()
  WHERE session_token = p_session_token
    AND room_pda = p_room_pda;
END;
$$;

-- Maintain permission hardening
REVOKE ALL ON FUNCTION public.submit_move(text, text, int, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_move(text, text, int, text, text, jsonb) TO anon, authenticated;