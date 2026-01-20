CREATE OR REPLACE FUNCTION public.upsert_game_session(
  p_room_pda text,
  p_game_type text,
  p_game_state jsonb,
  p_current_turn_wallet text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_status text DEFAULT 'active'::text,
  p_mode text DEFAULT 'casual'::text,
  p_caller_wallet text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_record RECORD;
BEGIN
  -- Validate required fields
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;
  
  IF p_player1_wallet IS NULL OR length(p_player1_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player1_wallet';
  END IF;
  
  IF p_game_type IS NULL OR length(p_game_type) < 1 THEN
    RAISE EXCEPTION 'Invalid game_type';
  END IF;
  
  IF p_status NOT IN ('active', 'finished') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  
  IF p_mode NOT IN ('casual', 'ranked') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  -- Check if session already exists
  SELECT * INTO v_existing_record 
  FROM game_sessions 
  WHERE room_pda = p_room_pda;
  
  IF FOUND THEN
    -- For updates, verify caller is a participant
    IF p_caller_wallet IS NOT NULL THEN
      IF p_caller_wallet != v_existing_record.player1_wallet 
         AND p_caller_wallet != v_existing_record.player2_wallet THEN
        RAISE EXCEPTION 'Caller is not a participant in this game';
      END IF;
    END IF;
    
    -- Update existing session
    -- FIX: Do NOT overwrite mode - preserve existing mode (set by game-session-set-settings)
    UPDATE game_sessions
    SET game_state = p_game_state,
        current_turn_wallet = p_current_turn_wallet,
        player2_wallet = COALESCE(p_player2_wallet, player2_wallet),
        status = p_status,
        -- REMOVED: mode = p_mode  <-- This was causing ranked->casual overwrite
        updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    -- For new sessions, caller must be player1 (creator)
    IF p_caller_wallet IS NOT NULL AND p_caller_wallet != p_player1_wallet THEN
      RAISE EXCEPTION 'Only the room creator can create the game session';
    END IF;
    
    -- Insert new session (mode is set on INSERT only)
    INSERT INTO game_sessions (
      room_pda, game_type, game_state, current_turn_wallet,
      player1_wallet, player2_wallet, status, mode
    ) VALUES (
      p_room_pda, p_game_type, p_game_state, p_current_turn_wallet,
      p_player1_wallet, p_player2_wallet, p_status, p_mode
    );
  END IF;
END;
$function$;