-- SECURITY FIX 2: Prevent setting winner when no game moves exist
-- This blocks the exploit where an attacker forfeits another player's game
-- before any moves are played, stealing their SOL.
CREATE OR REPLACE FUNCTION public.finish_game_session(
  p_room_pda text,
  p_caller_wallet text DEFAULT NULL::text,
  p_winner_wallet text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_record RECORD;
  v_move_count INTEGER;
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

  -- SECURITY: If setting a winner, require at least 1 game move
  -- This prevents attackers from forfeiting someone else and claiming the win
  -- with zero gameplay evidence. Auto-forfeit (3 strikes) records timeout moves
  -- so this guard does not block legitimate timeouts.
  IF p_winner_wallet IS NOT NULL AND v_existing_record.winner_wallet IS NULL THEN
    SELECT COUNT(*) INTO v_move_count
    FROM game_moves
    WHERE room_pda = p_room_pda
    LIMIT 1;

    IF v_move_count = 0 THEN
      RAISE EXCEPTION 'Cannot set winner without game moves';
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
$function$;