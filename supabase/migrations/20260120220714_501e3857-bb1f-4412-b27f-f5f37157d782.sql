-- Make auto_forfeit idempotent on finished games
-- If game is already finished and client submits auto_forfeit, return success instead of error
CREATE OR REPLACE FUNCTION public.submit_game_move(
  p_room_pda TEXT,
  p_wallet TEXT,
  p_move_data JSONB,
  p_client_move_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_session_id TEXT;
  v_max_turn INT;
  v_new_turn INT;
  v_prev_hash TEXT;
  v_new_hash TEXT;
  v_move_type TEXT;
  v_next_turn_wallet TEXT;
  v_existing_move RECORD;
BEGIN
  -- Get move type for validation
  v_move_type := p_move_data->>'type';
  
  -- Lock session row to prevent race conditions
  SELECT *
  INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;
  
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;
  
  v_session_id := v_session.room_pda;
  
  -- IDEMPOTENCY FIX: If game is finished AND this is auto_forfeit, return success (no-op)
  IF v_session.status = 'finished' THEN
    IF v_move_type = 'auto_forfeit' THEN
      RETURN jsonb_build_object(
        'success', true,
        'gameFinished', true,
        'idempotent', true,
        'message', 'game_already_finished'
      );
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'game_finished');
    END IF;
  END IF;
  
  -- Check wallet is a participant
  IF p_wallet != v_session.player1_wallet AND p_wallet != v_session.player2_wallet THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;
  
  -- Idempotency check: If this exact client_move_id already exists, return success
  IF p_client_move_id IS NOT NULL THEN
    SELECT * INTO v_existing_move
    FROM game_moves
    WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id
    LIMIT 1;
    
    IF v_existing_move IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'moveHash', v_existing_move.move_hash,
        'turnNumber', v_existing_move.turn_number,
        'idempotent', true
      );
    END IF;
  ELSIF v_session.mode = 'ranked' THEN
    -- Ranked games REQUIRE client_move_id for idempotency
    RETURN jsonb_build_object('success', false, 'error', 'missing_client_move_id');
  END IF;
  
  -- Turn ownership validation for turn-ending moves (turn_end, turn_timeout, auto_forfeit)
  IF v_move_type IN ('turn_end', 'turn_timeout', 'auto_forfeit') THEN
    -- Must have turn authority set
    IF v_session.current_turn_wallet IS NULL AND v_session.starting_player_wallet IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_turn_authority');
    END IF;
    
    -- Validate it's the right player's turn (use current_turn_wallet, fallback to starting_player_wallet for first move)
    DECLARE
      v_authority TEXT := COALESCE(v_session.current_turn_wallet, v_session.starting_player_wallet);
    BEGIN
      IF p_wallet != v_authority THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', 'not_your_turn',
          'expectedPlayer', v_authority
        );
      END IF;
    END;
  END IF;
  
  -- Server-side timeout validation (anti-cheat)
  IF v_move_type IN ('turn_timeout', 'auto_forfeit') THEN
    -- Validate timeout legitimacy: turn_started_at + turn_time_seconds < now()
    IF v_session.turn_started_at IS NOT NULL AND v_session.turn_time_seconds > 0 THEN
      IF v_session.turn_started_at + (v_session.turn_time_seconds || ' seconds')::interval > now() THEN
        -- Allow 2 second grace period for network latency
        IF v_session.turn_started_at + ((v_session.turn_time_seconds + 2) || ' seconds')::interval > now() THEN
          RETURN jsonb_build_object('success', false, 'error', 'timeout_too_early');
        END IF;
      END IF;
    END IF;
  END IF;
  
  -- Get max turn number and previous hash for chaining
  SELECT COALESCE(MAX(turn_number), 0), 
         COALESCE((SELECT move_hash FROM game_moves WHERE room_pda = p_room_pda ORDER BY turn_number DESC LIMIT 1), 'genesis')
  INTO v_max_turn, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;
  
  v_new_turn := v_max_turn + 1;
  
  -- Generate move hash (simple hash for now)
  v_new_hash := encode(sha256((p_room_pda || '|' || v_new_turn::text || '|' || p_wallet || '|' || p_move_data::text)::bytea), 'hex');
  
  -- Insert the move
  INSERT INTO game_moves (room_pda, turn_number, wallet, move_data, prev_hash, move_hash, client_move_id)
  VALUES (p_room_pda, v_new_turn, p_wallet, p_move_data, v_prev_hash, v_new_hash, p_client_move_id);
  
  -- Get next turn wallet from move data if it's a turn-ending move
  v_next_turn_wallet := p_move_data->>'nextTurnWallet';
  
  -- Handle auto_forfeit - mark game as finished
  IF v_move_type = 'auto_forfeit' THEN
    UPDATE game_sessions
    SET 
      status = 'finished',
      current_turn_wallet = NULL,
      updated_at = now()
    WHERE room_pda = p_room_pda;
    
    RETURN jsonb_build_object(
      'success', true,
      'moveHash', v_new_hash,
      'turnNumber', v_new_turn,
      'gameFinished', true
    );
  END IF;
  
  -- Update session for turn-ending moves
  IF v_move_type IN ('turn_end', 'turn_timeout') AND v_next_turn_wallet IS NOT NULL THEN
    UPDATE game_sessions
    SET 
      current_turn_wallet = v_next_turn_wallet,
      turn_started_at = now(),
      updated_at = now()
    WHERE room_pda = p_room_pda;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'moveHash', v_new_hash,
    'turnNumber', v_new_turn
  );
END;
$$;