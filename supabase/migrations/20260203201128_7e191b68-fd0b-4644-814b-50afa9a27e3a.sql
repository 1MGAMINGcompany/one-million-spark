-- Fix finish_game_session RPC to set status_int = 3 and game_over_at
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
  
  -- Mark as finished (BOTH status columns + game_over_at)
  UPDATE game_sessions
  SET status = 'finished',
      status_int = 3,
      game_over_at = COALESCE(game_over_at, now()),
      updated_at = now()
  WHERE room_pda = p_room_pda;
END;
$$;

-- Fix submit_game_move RPC to set status_int = 3 on auto_forfeit AND game_over
CREATE OR REPLACE FUNCTION public.submit_game_move(
  p_room_pda TEXT, 
  p_wallet TEXT, 
  p_move_data JSONB, 
  p_client_move_id TEXT DEFAULT NULL
)
RETURNS JSONB
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
  v_expected_turn_wallet TEXT;
  v_existing_timeout RECORD;
  v_is_participant BOOLEAN;
  v_all_accepted BOOLEAN;
  v_winner_wallet TEXT;
BEGIN
  v_move_type := p_move_data->>'type';
  
  -- Lock session row
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;
  
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;
  
  v_session_id := v_session.room_pda;
  
  -- *** FINISHED STATE CHECK (status_int = 3 or game_over_at set) ***
  IF v_session.status_int = 3 OR v_session.game_over_at IS NOT NULL THEN
    IF v_move_type IN ('auto_forfeit', 'turn_timeout', 'game_over') THEN
      RETURN jsonb_build_object('success', true, 'gameFinished', true, 'idempotent', true);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'game_finished');
    END IF;
  END IF;
  
  -- *** N-PLAYER PARTICIPANT VALIDATION ***
  v_is_participant := (p_wallet = ANY(v_session.participants));
  
  -- Fallback: check legacy player1/player2 columns
  IF NOT v_is_participant THEN
    v_is_participant := (p_wallet = v_session.player1_wallet OR p_wallet = COALESCE(v_session.player2_wallet, ''));
  END IF;
  
  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;
  
  -- *** GAME READY GATE (for ranked/private) - NO SHORTCUTS ***
  IF v_session.mode IN ('ranked', 'private') THEN
    v_all_accepted := all_participants_accepted(p_room_pda);
    
    IF NOT v_all_accepted THEN
      RETURN jsonb_build_object('success', false, 'error', 'game_not_ready');
    END IF;
    
    IF v_session.max_players <= 2 AND v_session.player2_wallet IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'waiting_for_player2');
    END IF;
  END IF;
  
  -- Idempotency check
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
    RETURN jsonb_build_object('success', false, 'error', 'missing_client_move_id');
  END IF;
  
  -- Turn ownership validation for turn-ending moves
  IF v_move_type IN ('turn_end', 'turn_timeout', 'auto_forfeit') THEN
    IF v_session.current_turn_wallet IS NULL AND v_session.starting_player_wallet IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_turn_authority');
    END IF;
    
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
  
  -- Timeout deduplication
  IF v_move_type IN ('turn_timeout', 'auto_forfeit') THEN
    IF v_session.turn_started_at IS NOT NULL AND v_session.turn_time_seconds > 0 THEN
      IF v_session.turn_started_at + ((v_session.turn_time_seconds + 2) || ' seconds')::interval > now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'timeout_too_early');
      END IF;
    END IF;
    
    v_expected_turn_wallet := p_move_data->>'timedOutWallet';
    IF v_expected_turn_wallet IS NOT NULL AND v_session.current_turn_wallet IS NOT NULL THEN
      IF v_session.current_turn_wallet != v_expected_turn_wallet THEN
        RETURN jsonb_build_object('success', false, 'error', 'timeout_already_processed');
      END IF;
    END IF;
    
    SELECT * INTO v_existing_timeout
    FROM game_moves
    WHERE room_pda = p_room_pda 
      AND move_data->>'type' IN ('turn_timeout', 'auto_forfeit')
      AND move_data->>'timedOutWallet' = p_move_data->>'timedOutWallet'
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_existing_timeout IS NOT NULL AND v_existing_timeout.created_at > (now() - interval '10 seconds') THEN
      RETURN jsonb_build_object('success', false, 'error', 'timeout_already_processed');
    END IF;
  END IF;
  
  -- Get max turn number and previous hash
  SELECT COALESCE(MAX(turn_number), 0), 
         COALESCE((SELECT move_hash FROM game_moves WHERE room_pda = p_room_pda ORDER BY turn_number DESC LIMIT 1), 'genesis')
  INTO v_max_turn, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;
  
  v_new_turn := v_max_turn + 1;
  v_new_hash := encode(sha256((p_room_pda || '|' || v_new_turn::text || '|' || p_wallet || '|' || p_move_data::text)::bytea), 'hex');
  
  -- Insert the move
  INSERT INTO game_moves (room_pda, turn_number, wallet, move_data, prev_hash, move_hash, client_move_id)
  VALUES (p_room_pda, v_new_turn, p_wallet, p_move_data, v_prev_hash, v_new_hash, p_client_move_id);
  
  -- *** STATUS MACHINE: waiting (1) → active (2) on first real move ***
  IF v_session.status_int = 1 AND v_move_type NOT IN ('turn_timeout', 'auto_forfeit') THEN
    UPDATE game_sessions 
    SET status_int = 2, status = 'active', updated_at = now() 
    WHERE room_pda = p_room_pda;
  END IF;
  
  v_next_turn_wallet := p_move_data->>'nextTurnWallet';
  
  -- *** HANDLE game_over MOVE TYPE (2 → 3) ***
  IF v_move_type = 'game_over' THEN
    v_winner_wallet := p_move_data->>'winnerWallet';
    
    UPDATE game_sessions
    SET status_int = 3,
        status = 'finished',
        winner_wallet = v_winner_wallet,
        game_over_at = now(),
        current_turn_wallet = NULL,
        updated_at = now()
    WHERE room_pda = p_room_pda;
    
    RETURN jsonb_build_object(
      'success', true,
      'moveHash', v_new_hash,
      'turnNumber', v_new_turn,
      'gameFinished', true,
      'winnerWallet', v_winner_wallet
    );
  END IF;
  
  -- *** HANDLE auto_forfeit - FIXED: set status_int = 3 and game_over_at ***
  IF v_move_type = 'auto_forfeit' THEN
    v_winner_wallet := p_move_data->>'winnerWallet';
    
    UPDATE game_sessions
    SET status_int = 3,
        status = 'finished',
        winner_wallet = v_winner_wallet,
        game_over_at = now(),
        current_turn_wallet = NULL,
        updated_at = now()
    WHERE room_pda = p_room_pda;
    
    RETURN jsonb_build_object(
      'success', true,
      'moveHash', v_new_hash,
      'turnNumber', v_new_turn,
      'gameFinished', true,
      'winnerWallet', v_winner_wallet
    );
  END IF;
  
  -- Update current_turn_wallet for turn-ending moves
  IF v_move_type IN ('turn_end', 'turn_timeout') AND v_next_turn_wallet IS NOT NULL THEN
    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
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