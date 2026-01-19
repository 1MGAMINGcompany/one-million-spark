-- Update ensure_game_session to properly reset finished sessions
CREATE OR REPLACE FUNCTION public.ensure_game_session(
  p_room_pda text,
  p_game_type text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_mode text DEFAULT 'casual'::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_status text;
BEGIN
  -- Validation
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;
  
  IF p_player1_wallet IS NULL OR length(p_player1_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player1_wallet';
  END IF;
  
  IF p_player2_wallet IS NOT NULL AND length(p_player2_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player2_wallet';
  END IF;

  IF p_mode NOT IN ('casual', 'ranked') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  -- Check existing session status
  SELECT status INTO existing_status 
  FROM game_sessions 
  WHERE room_pda = p_room_pda;

  IF existing_status = 'finished' THEN
    -- RESET for new game in same room
    UPDATE game_sessions SET
      game_type = p_game_type,
      game_state = '{}'::jsonb,
      player1_wallet = p_player1_wallet,
      player2_wallet = p_player2_wallet,
      mode = p_mode,
      -- Reset start roll fields
      start_roll_finalized = false,
      starting_player_wallet = NULL,
      start_roll = NULL,
      start_roll_seed = NULL,
      -- Reset turn state
      current_turn_wallet = NULL,
      -- Reset ranked acceptance
      p1_ready = false,
      p2_ready = false,
      -- Pre-game state (not 'active')
      status = 'waiting',
      updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    -- Normal insert with 'waiting' status
    INSERT INTO game_sessions (
      room_pda, game_type, game_state, 
      player1_wallet, player2_wallet, 
      status, mode
    ) VALUES (
      p_room_pda, p_game_type, '{}'::jsonb,
      p_player1_wallet, p_player2_wallet,
      'waiting', p_mode
    )
    -- Update game_type and mode on conflict
    ON CONFLICT (room_pda) DO UPDATE SET
      player2_wallet = COALESCE(game_sessions.player2_wallet, EXCLUDED.player2_wallet),
      game_type = EXCLUDED.game_type,
      mode = EXCLUDED.mode,
      updated_at = now();
  END IF;
END;
$$;