-- Create game_moves table for storing move history with hash chain
CREATE TABLE IF NOT EXISTS public.game_moves (
  room_pda text NOT NULL,
  turn_number int NOT NULL,
  wallet text NOT NULL,
  move_hash text NOT NULL,
  prev_hash text NOT NULL,
  move_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_pda, turn_number)
);

-- Enable RLS (no public access - controlled via SECURITY DEFINER function)
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_game_moves_room ON public.game_moves(room_pda);

-- RPC: submit_move with session validation, monotonic turn, and hash chain
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
  -- Load session from player_sessions (our actual table)
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

  -- Hash chain enforcement (replay/tamper protection)
  IF p_prev_hash <> v_last_hash THEN
    RAISE EXCEPTION 'bad prev hash';
  END IF;

  -- Store move (primary key prevents duplicate turn inserts)
  INSERT INTO game_moves(room_pda, turn_number, wallet, move_hash, prev_hash, move_data)
  VALUES (p_room_pda, p_turn_number, v_wallet, p_move_hash, p_prev_hash, p_move_data);

  -- Advance session state
  UPDATE player_sessions
  SET last_turn = p_turn_number,
      last_hash = p_move_hash
  WHERE session_token = p_session_token;
END;
$$;

-- Grant execute to anon and authenticated
REVOKE ALL ON FUNCTION public.submit_move(text, text, int, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_move(text, text, int, text, text, jsonb) TO anon, authenticated;