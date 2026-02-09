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
  v_last_move RECORD;
  v_move_type TEXT;
  v_next_turn_wallet TEXT;
  v_turn_number INTEGER;
  v_prev_hash TEXT;
  v_move_hash TEXT;
  v_timeout_wallet TEXT;
  v_turn_deadline TIMESTAMPTZ;
  v_timed_out_wallet TEXT;
  v_winner_wallet TEXT;
  v_game_over_reason TEXT;
  v_last_turn_end_other INTEGER;
  v_game_type TEXT;
BEGIN
  -- Lock session row for atomic turn updates
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  -- Reject if game already finished
  IF v_session.status_int = 3 OR v_session.game_over_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'game_already_finished');
  END IF;

  -- Hard Game Ready Gate: both players must be ready
  IF NOT (v_session.p1_ready AND v_session.p2_ready) THEN
    RETURN jsonb_build_object('success', false, 'error', 'players_not_ready');
  END IF;

  -- Extract move type and game type
  v_move_type := p_move_data->>'type';
  v_game_type := v_session.game_type;

  -- =======================================================
  -- FIX: Guard against move after turn_end from same player
  -- =======================================================
  SELECT * INTO v_last_move
  FROM game_moves
  WHERE room_pda = p_room_pda
  ORDER BY turn_number DESC
  LIMIT 1;

  IF v_last_move IS NOT NULL 
     AND (v_last_move.move_data->>'type') = 'turn_end'
     AND v_move_type IN ('dice_roll', 'move')
     AND v_last_move.wallet = p_wallet
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'turn_already_ended');
  END IF;
  -- =======================================================

  -- =======================================================
  -- Block duplicate dice_roll within same turn
  -- =======================================================
  IF v_move_type = 'dice_roll' THEN
    SELECT COALESCE(MAX(turn_number), 0) INTO v_last_turn_end_other
    FROM game_moves
    WHERE room_pda = p_room_pda
      AND (move_data->>'type') = 'turn_end'
      AND wallet != p_wallet;
    
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda
        AND wallet = p_wallet
        AND (move_data->>'type') = 'dice_roll'
        AND turn_number > v_last_turn_end_other
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_rolled');
    END IF;
  END IF;
  -- =======================================================

  -- Idempotency check via client_move_id
  IF p_client_move_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id
    ) THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  -- Ownership validation (only current turn wallet can submit moves)
  -- Exception: turn_timeout and auto_forfeit can be submitted by opponent
  IF v_move_type NOT IN ('turn_timeout', 'auto_forfeit') THEN
    IF v_session.current_turn_wallet IS NOT NULL AND v_session.current_turn_wallet != p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_your_turn');
    END IF;
  END IF;

  -- For turn_timeout: validate timing + dedupe
  IF v_move_type = 'turn_timeout' THEN
    v_timeout_wallet := p_move_data->>'timedOutWallet';
    
    IF v_timeout_wallet = p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'cannot_timeout_self');
    END IF;
    
    IF v_session.current_turn_wallet != v_timeout_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'wrong_timeout_target');
    END IF;
    
    v_turn_deadline := v_session.turn_started_at + (v_session.turn_time_seconds || ' seconds')::INTERVAL;
    IF NOW() < v_turn_deadline - INTERVAL '2 seconds' THEN
      RETURN jsonb_build_object('success', false, 'error', 'timeout_too_early');
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda
        AND (move_data->>'type') = 'turn_timeout'
        AND wallet = v_timeout_wallet
        AND turn_number >= v_session.status_int
      ORDER BY turn_number DESC
      LIMIT 1
    ) THEN
      RETURN jsonb_build_object('success', true, 'dedupe', true, 'reason', 'timeout_already_recorded');
    END IF;
  END IF;

  -- Calculate turn number and hashes
  SELECT COALESCE(MAX(turn_number), 0) + 1, COALESCE(MAX(move_hash), 'genesis')
  INTO v_turn_number, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;

  v_move_hash := encode(sha256((v_prev_hash || p_move_data::text)::bytea), 'hex');

  -- Insert the move
  INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash, client_move_id)
  VALUES (p_room_pda, p_wallet, v_turn_number, p_move_data, v_prev_hash, v_move_hash, p_client_move_id);

  -- =====================================================
  -- RESET STRIKES ON SUCCESSFUL ACTION
  -- =====================================================
  IF v_move_type IN ('dice_roll', 'move', 'turn_end') OR v_move_type IS NULL THEN
    UPDATE game_sessions
    SET missed_turns = COALESCE(missed_turns, '{}'::jsonb) - p_wallet
    WHERE room_pda = p_room_pda 
      AND missed_turns ? p_wallet;
  END IF;
  -- =====================================================

  -- Handle turn changes based on move type
  v_next_turn_wallet := p_move_data->>'nextTurnWallet';
  
  IF v_move_type = 'turn_end' AND v_next_turn_wallet IS NOT NULL THEN
    -- Regular turn end - switch to next player
    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
    
  ELSIF v_move_type = 'turn_timeout' THEN
    -- Timeout - switch turn to caller (the opponent)
    UPDATE game_sessions
    SET current_turn_wallet = p_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
    
  ELSIF v_move_type = 'auto_forfeit' THEN
    v_timed_out_wallet := p_move_data->>'timedOutWallet';
    v_winner_wallet := p_move_data->>'winnerWallet';
    v_game_over_reason := COALESCE(p_move_data->>'reason', 'auto_forfeit');
    
    UPDATE game_sessions
    SET status = 'finished',
        status_int = 3,
        winner_wallet = v_winner_wallet,
        game_over_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
    
  ELSIF v_move_type IN ('resign', 'forfeit') THEN
    IF v_session.player1_wallet = p_wallet THEN
      v_winner_wallet := v_session.player2_wallet;
    ELSE
      v_winner_wallet := v_session.player1_wallet;
    END IF;
    
    UPDATE game_sessions
    SET status = 'finished',
        status_int = 3,
        winner_wallet = v_winner_wallet,
        game_over_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;

  -- ==========================================================
  -- AUTO TURN-FLIP for Chess / Checkers / Dominos
  -- These games end the turn on every normal move.
  -- Backgammon and Ludo use explicit turn_end, so they skip this.
  -- ==========================================================
  ELSIF v_game_type IN ('chess', 'checkers', 'dominos')
    AND (v_move_type IS NULL OR v_move_type IN ('move', 'chess_move', 'checkers_move', 'dominos_move'))
  THEN
    -- Flip to the other player
    IF v_session.player1_wallet = p_wallet THEN
      v_next_turn_wallet := v_session.player2_wallet;
    ELSE
      v_next_turn_wallet := v_session.player1_wallet;
    END IF;

    IF v_next_turn_wallet IS NOT NULL THEN
      UPDATE game_sessions
      SET current_turn_wallet = v_next_turn_wallet,
          turn_started_at = NOW(),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'turn_number', v_turn_number,
    'move_hash', v_move_hash
  );
END;
$$;