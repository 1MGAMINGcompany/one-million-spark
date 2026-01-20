-- Add validation in submit_game_move to reject turn_timeout where nextTurnWallet = timedOutWallet
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
  v_next_turn_number INT;
  v_prev_hash TEXT;
  v_new_hash TEXT;
  v_move_type TEXT;
  v_next_turn_wallet TEXT;
  v_existing_move RECORD;
  v_turn_started_at TIMESTAMPTZ;
  v_timed_out_wallet TEXT;
BEGIN
  -- Extract move type for validation
  v_move_type := p_move_data->>'type';

  -- Idempotency check: if client_move_id already exists, return existing move data
  IF p_client_move_id IS NOT NULL THEN
    SELECT * INTO v_existing_move
    FROM game_moves
    WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id
    LIMIT 1;
    
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'turnNumber', v_existing_move.turn_number,
        'moveHash', v_existing_move.move_hash
      );
    END IF;
  END IF;

  -- Lock the session row to prevent race conditions
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  -- Validate participant
  IF v_session.player1_wallet IS NULL OR v_session.player2_wallet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'incomplete_room');
  END IF;
  
  IF p_wallet NOT IN (v_session.player1_wallet, v_session.player2_wallet) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  -- For turn-ending moves, validate turn authority
  IF v_move_type IN ('turn_end', 'turn_timeout', 'auto_forfeit') THEN
    -- Determine expected turn wallet
    DECLARE
      v_expected_wallet TEXT;
    BEGIN
      IF v_session.current_turn_wallet IS NOT NULL THEN
        v_expected_wallet := v_session.current_turn_wallet;
      ELSIF v_session.starting_player_wallet IS NOT NULL THEN
        v_expected_wallet := v_session.starting_player_wallet;
      ELSE
        -- First move fallback: accept from either player
        v_expected_wallet := p_wallet;
      END IF;
      
      -- Validate turn ownership (case-insensitive comparison)
      IF LOWER(TRIM(p_wallet)) <> LOWER(TRIM(v_expected_wallet)) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'not_your_turn',
          'expected', v_expected_wallet,
          'got', p_wallet
        );
      END IF;
    END;
    
    -- NEW: Validate turn_timeout has valid nextTurnWallet (must differ from timedOutWallet)
    IF v_move_type = 'turn_timeout' THEN
      v_timed_out_wallet := p_move_data->>'timedOutWallet';
      v_next_turn_wallet := p_move_data->>'nextTurnWallet';
      
      IF v_next_turn_wallet IS NULL OR v_timed_out_wallet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_timeout_wallets');
      END IF;
      
      -- CRITICAL: nextTurnWallet must NOT equal timedOutWallet
      IF LOWER(TRIM(v_next_turn_wallet)) = LOWER(TRIM(v_timed_out_wallet)) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'invalid_timeout_wallet',
          'message', 'nextTurnWallet cannot equal timedOutWallet'
        );
      END IF;
    END IF;
    
    -- For turn_timeout, validate the timeout is legitimate (not too early)
    IF v_move_type = 'turn_timeout' AND v_session.turn_started_at IS NOT NULL THEN
      DECLARE
        v_elapsed_seconds INT;
        v_allowed_seconds INT;
      BEGIN
        v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_session.turn_started_at))::INT;
        v_allowed_seconds := COALESCE(v_session.turn_time_seconds, 60);
        
        -- Allow 5 second grace period for network delays
        IF v_elapsed_seconds < (v_allowed_seconds - 5) THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'timeout_too_early',
            'elapsed', v_elapsed_seconds,
            'required', v_allowed_seconds
          );
        END IF;
      END;
    END IF;
  END IF;

  -- Get next turn number
  SELECT COALESCE(MAX(turn_number), 0) + 1 INTO v_next_turn_number
  FROM game_moves
  WHERE room_pda = p_room_pda;

  -- Get previous hash for chain
  SELECT move_hash INTO v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda
  ORDER BY turn_number DESC
  LIMIT 1;
  
  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'genesis';
  END IF;

  -- Compute deterministic hash
  v_new_hash := encode(
    sha256(
      (p_room_pda || '|' || v_next_turn_number::TEXT || '|' || p_wallet || '|' || p_move_data::TEXT || '|' || v_prev_hash)::bytea
    ),
    'hex'
  );

  -- Insert the move
  INSERT INTO game_moves (room_pda, turn_number, wallet, move_data, move_hash, prev_hash, client_move_id)
  VALUES (p_room_pda, v_next_turn_number, p_wallet, p_move_data, v_new_hash, v_prev_hash, p_client_move_id);

  -- For turn-ending moves, update session turn state
  IF v_move_type IN ('turn_end', 'turn_timeout') THEN
    v_next_turn_wallet := p_move_data->>'nextTurnWallet';
    
    IF v_next_turn_wallet IS NOT NULL THEN
      UPDATE game_sessions
      SET 
        current_turn_wallet = v_next_turn_wallet,
        turn_started_at = now(),
        updated_at = now()
      WHERE room_pda = p_room_pda;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'turnNumber', v_next_turn_number,
    'moveHash', v_new_hash,
    'prevHash', v_prev_hash
  );
END;
$$;