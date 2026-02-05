-- Update finish_game_session to accept and set winner_wallet
CREATE OR REPLACE FUNCTION public.finish_game_session(
  p_room_pda TEXT,
  p_caller_wallet TEXT DEFAULT NULL,
  p_winner_wallet TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_record RECORD;
BEGIN
  -- Validate room_pda
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;

  -- Get existing session
  SELECT * INTO v_existing_record 
  FROM game_sessions 
  WHERE room_pda = p_room_pda;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game session not found';
  END IF;
  
  -- Verify caller is a participant (if provided)
  IF p_caller_wallet IS NOT NULL THEN
    IF p_caller_wallet != v_existing_record.player1_wallet 
       AND p_caller_wallet != v_existing_record.player2_wallet THEN
      RAISE EXCEPTION 'Caller is not a participant in this game';
    END IF;
  END IF;
  
  -- Mark as finished with winner (BOTH status columns + game_over_at + winner)
  UPDATE game_sessions
  SET status = 'finished',
      status_int = 3,
      game_over_at = COALESCE(game_over_at, now()),
      winner_wallet = COALESCE(p_winner_wallet, winner_wallet),
      updated_at = now()
  WHERE room_pda = p_room_pda;
END;
$$;