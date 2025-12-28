-- First, drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can create game sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "Anyone can update game sessions" ON public.game_sessions;

-- Create a secure function to upsert game sessions
-- This function validates that the caller wallet is a participant
CREATE OR REPLACE FUNCTION public.upsert_game_session(
  p_room_pda TEXT,
  p_game_type TEXT,
  p_game_state JSONB,
  p_current_turn_wallet TEXT,
  p_player1_wallet TEXT,
  p_player2_wallet TEXT,
  p_status TEXT DEFAULT 'active',
  p_mode TEXT DEFAULT 'casual',
  p_caller_wallet TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    UPDATE game_sessions
    SET game_state = p_game_state,
        current_turn_wallet = p_current_turn_wallet,
        player2_wallet = COALESCE(p_player2_wallet, player2_wallet),
        status = p_status,
        mode = p_mode,
        updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    -- For new sessions, caller must be player1 (creator)
    IF p_caller_wallet IS NOT NULL AND p_caller_wallet != p_player1_wallet THEN
      RAISE EXCEPTION 'Only the room creator can create the game session';
    END IF;
    
    -- Insert new session
    INSERT INTO game_sessions (
      room_pda, game_type, game_state, current_turn_wallet,
      player1_wallet, player2_wallet, status, mode
    ) VALUES (
      p_room_pda, p_game_type, p_game_state, p_current_turn_wallet,
      p_player1_wallet, p_player2_wallet, p_status, p_mode
    );
  END IF;
END;
$$;

-- Create a function to finish a game session
CREATE OR REPLACE FUNCTION public.finish_game_session(
  p_room_pda TEXT,
  p_caller_wallet TEXT DEFAULT NULL
)
RETURNS void
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
  
  -- Verify caller is a participant
  IF p_caller_wallet IS NOT NULL THEN
    IF p_caller_wallet != v_existing_record.player1_wallet 
       AND p_caller_wallet != v_existing_record.player2_wallet THEN
      RAISE EXCEPTION 'Caller is not a participant in this game';
    END IF;
  END IF;
  
  -- Mark as finished
  UPDATE game_sessions
  SET status = 'finished',
      updated_at = now()
  WHERE room_pda = p_room_pda;
END;
$$;