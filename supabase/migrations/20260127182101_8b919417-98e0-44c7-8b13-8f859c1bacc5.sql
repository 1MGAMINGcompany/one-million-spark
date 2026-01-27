-- Fix 1: Update the CHECK constraint to include 'private'
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_mode_check;

ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_mode_check 
  CHECK (mode = ANY (ARRAY['casual'::text, 'ranked'::text, 'private'::text]));

-- Fix 2: Update upsert_game_session RPC to allow 'private' mode
CREATE OR REPLACE FUNCTION public.upsert_game_session(p_room_pda text, p_game_type text, p_game_state jsonb, p_current_turn_wallet text, p_player1_wallet text, p_player2_wallet text, p_status text DEFAULT 'active'::text, p_mode text DEFAULT 'casual'::text, p_caller_wallet text DEFAULT NULL::text)
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
  
  -- UPDATED: Include 'private' in allowed modes
  IF p_mode NOT IN ('casual', 'ranked', 'private') THEN
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
    
    -- UPDATE: Lock down server-controlled fields
    UPDATE game_sessions
    SET game_state = p_game_state,
        player2_wallet = COALESCE(p_player2_wallet, player2_wallet),
        status = CASE 
          WHEN v_existing_record.mode = 'ranked' THEN v_existing_record.status
          ELSE p_status
        END,
        updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    -- For new sessions, caller must be player1 (creator)
    IF p_caller_wallet IS NOT NULL AND p_caller_wallet != p_player1_wallet THEN
      RAISE EXCEPTION 'Only the room creator can create the game session';
    END IF;
    
    -- INSERT: Full control allowed for creation
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

-- Fix 3: Update ensure_game_session RPC to allow 'private' mode
CREATE OR REPLACE FUNCTION public.ensure_game_session(p_room_pda text, p_game_type text, p_player1_wallet text, p_player2_wallet text, p_mode text DEFAULT 'casual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- UPDATED: Include 'private' in allowed modes
  IF p_mode NOT IN ('casual', 'ranked', 'private') THEN
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
      start_roll_finalized = false,
      starting_player_wallet = NULL,
      start_roll = NULL,
      start_roll_seed = NULL,
      current_turn_wallet = NULL,
      p1_ready = false,
      p2_ready = false,
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
    ON CONFLICT (room_pda) DO UPDATE SET
      player2_wallet = COALESCE(EXCLUDED.player2_wallet, game_sessions.player2_wallet),
      game_type = EXCLUDED.game_type,
      updated_at = now();
  END IF;
END;
$function$;