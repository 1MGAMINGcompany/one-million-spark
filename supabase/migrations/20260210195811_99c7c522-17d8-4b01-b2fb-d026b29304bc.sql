
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
  v_game_type_lower TEXT;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF v_session.status_int = 3 OR v_session.game_over_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'game_already_finished');
  END IF;

  IF NOT (v_session.p1_ready AND v_session.p2_ready) THEN
    RETURN jsonb_build_object('success', false, 'error', 'players_not_ready');
  END IF;

  v_move_type := p_move_data->>'type';
  v_game_type_lower := COALESCE(LOWER(v_session.game_type), '');

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

  IF p_client_move_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id
    ) THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  IF v_move_type NOT IN ('turn_timeout', 'auto_forfeit') THEN
    IF v_session.current_turn_wallet IS NOT NULL AND v_session.current_turn_wallet != p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_your_turn');
    END IF;
  END IF;

  IF v_move_type = 'turn_timeout' THEN
    v_timeout_wallet := p_move_data->>'timedOutWallet';
    
    IF v_timeout_wallet = p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'cannot_timeout_self');
    END IF;
    
    IF v_session.current_turn_wallet != v_timeout_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'wrong_timeout_target');
    END IF;
    
    v_turn_deadline := v_session.turn_started_at + (v_session.turn_time_seconds || ' seconds')::INTERVAL;
    IF NOW() < v_turn_deadline THEN
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

  SELECT COALESCE(MAX(turn_number), 0) + 1, COALESCE(MAX(move_hash), 'genesis')
  INTO v_turn_number, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;

  v_move_hash := encode(sha256((v_prev_hash || p_move_data::text)::bytea), 'hex');

  INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash, client_move_id)
  VALUES (p_room_pda, p_wallet, v_turn_number, p_move_data, v_prev_hash, v_move_hash, p_client_move_id);

  v_next_turn_wallet := v_session.current_turn_wallet;

  IF v_move_type IN ('turn_timeout', 'auto_forfeit') THEN
    v_next_turn_wallet := p_move_data->>'nextTurnWallet';
    
    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;

  ELSIF v_move_type = 'turn_end' THEN
    IF v_session.player1_wallet = p_wallet THEN
      v_next_turn_wallet := v_session.player2_wallet;
    ELSE
      v_next_turn_wallet := v_session.player1_wallet;
    END IF;

    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;

  -- FIX: Accept both numeric IDs AND string game types for auto-flip
  -- Chess='1'/'chess', Dominos='2'/'dominos', Checkers='4'/'checkers'
  -- Excludes Backgammon ('3'/'backgammon') and Ludo ('5'/'ludo') for multi-move turns
  ELSIF (
    v_session.game_type IN ('1', '2', '4')
    OR v_game_type_lower IN ('chess', 'dominos', 'checkers')
  ) THEN
    IF v_session.player1_wallet = p_wallet THEN
      v_next_turn_wallet := v_session.player2_wallet;
    ELSE
      v_next_turn_wallet := v_session.player1_wallet;
    END IF;

    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  END IF;

  -- Reset strikes on successful player action
  IF v_move_type NOT IN ('turn_timeout', 'auto_forfeit', 'player_eliminated') THEN
    UPDATE game_sessions
    SET missed_turns = CASE
          WHEN missed_turns IS NOT NULL AND missed_turns ? p_wallet
          THEN missed_turns - p_wallet
          ELSE missed_turns
        END
    WHERE room_pda = p_room_pda;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'turnNumber', v_turn_number,
    'moveHash', v_move_hash,
    'nextTurnWallet', v_next_turn_wallet
  );
END;
$$;
