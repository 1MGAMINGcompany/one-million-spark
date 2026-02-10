
CREATE OR REPLACE FUNCTION public.maybe_apply_turn_timeout(p_room_pda TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_deadline TIMESTAMPTZ;
  v_timed_out_wallet TEXT;
  v_next_wallet TEXT;
  v_current_strikes INTEGER;
  v_new_strikes INTEGER;
  v_winner_wallet TEXT;
  v_turn_number INTEGER;
  v_prev_hash TEXT;
  v_move_hash TEXT;
  v_participants TEXT[];
  v_eliminated TEXT[];
  v_active_players TEXT[];
  v_player_count INTEGER;
  v_next_idx INTEGER;
  v_current_idx INTEGER;
  v_last_move_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'session_not_found');
  END IF;

  IF v_session.status_int >= 3 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'game_finished');
  END IF;

  IF NOT (v_session.p1_ready AND v_session.p2_ready) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_active');
  END IF;

  IF v_session.current_turn_wallet IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_holder');
  END IF;

  IF v_session.turn_started_at IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_start_time');
  END IF;

  -- RECENT MOVE GUARD: never timeout within 2 seconds of the last recorded move
  SELECT MAX(created_at) INTO v_last_move_at
  FROM game_moves
  WHERE room_pda = p_room_pda;

  IF v_last_move_at IS NOT NULL AND (NOW() - v_last_move_at) < INTERVAL '2 seconds' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'recent_move_guard');
  END IF;

  -- Calculate deadline (no grace -- exact expiry)
  v_deadline := v_session.turn_started_at + 
                (v_session.turn_time_seconds || ' seconds')::INTERVAL;

  IF NOW() < v_deadline THEN
    RETURN jsonb_build_object(
      'applied', false, 
      'reason', 'not_expired',
      'remaining_seconds', EXTRACT(EPOCH FROM (v_deadline - NOW()))::INTEGER
    );
  END IF;

  v_timed_out_wallet := v_session.current_turn_wallet;
  
  v_participants := COALESCE(v_session.participants, ARRAY[v_session.player1_wallet, v_session.player2_wallet]);
  v_eliminated := COALESCE(v_session.eliminated_players, ARRAY[]::TEXT[]);
  
  SELECT ARRAY_AGG(p) INTO v_active_players
  FROM unnest(v_participants) AS p
  WHERE p IS NOT NULL 
    AND p != '' 
    AND p != '11111111111111111111111111111111'
    AND NOT (p = ANY(v_eliminated));
  
  v_player_count := COALESCE(array_length(v_active_players, 1), 0);
  
  v_current_idx := NULL;
  FOR i IN 1..v_player_count LOOP
    IF v_active_players[i] = v_timed_out_wallet THEN
      v_current_idx := i;
      EXIT;
    END IF;
  END LOOP;
  
  IF v_player_count <= 1 THEN
    v_next_wallet := NULL;
  ELSIF v_current_idx IS NULL THEN
    v_next_wallet := v_active_players[1];
  ELSE
    v_next_idx := (v_current_idx % v_player_count) + 1;
    v_next_wallet := v_active_players[v_next_idx];
  END IF;
  
  IF v_next_wallet IS NULL AND v_session.max_players <= 2 THEN
    IF v_timed_out_wallet = v_session.player1_wallet THEN
      v_next_wallet := v_session.player2_wallet;
    ELSE
      v_next_wallet := v_session.player1_wallet;
    END IF;
  END IF;

  v_current_strikes := COALESCE(
    (v_session.missed_turns->>v_timed_out_wallet)::INTEGER, 
    0
  );
  v_new_strikes := v_current_strikes + 1;

  SELECT COALESCE(MAX(turn_number), 0) + 1, COALESCE(MAX(move_hash), 'genesis')
  INTO v_turn_number, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;

  IF v_new_strikes >= 3 THEN
    IF v_session.max_players <= 2 THEN
      v_winner_wallet := v_next_wallet;
      
      v_move_hash := encode(sha256((v_prev_hash || 
        jsonb_build_object(
          'type', 'auto_forfeit',
          'timedOutWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts'
        )::text)::bytea), 'hex');

      INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
      VALUES (
        p_room_pda,
        v_timed_out_wallet,
        v_turn_number,
        jsonb_build_object(
          'type', 'auto_forfeit',
          'timedOutWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts',
          'dice', '[]'::jsonb,
          'remainingMoves', '[]'::jsonb
        ),
        v_prev_hash,
        v_move_hash
      );

      UPDATE game_sessions
      SET status = 'finished',
          status_int = 3,
          winner_wallet = v_winner_wallet,
          game_over_at = NOW(),
          missed_turns = COALESCE(missed_turns, '{}'::jsonb) || 
                         jsonb_build_object(v_timed_out_wallet, v_new_strikes),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;

      RETURN jsonb_build_object(
        'applied', true,
        'action', 'auto_forfeit',
        'timedOutWallet', v_timed_out_wallet,
        'winnerWallet', v_winner_wallet,
        'strikes', v_new_strikes
      );
    ELSE
      v_move_hash := encode(sha256((v_prev_hash || 
        jsonb_build_object(
          'type', 'auto_eliminate',
          'timedOutWallet', v_timed_out_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts'
        )::text)::bytea), 'hex');

      INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
      VALUES (
        p_room_pda,
        v_timed_out_wallet,
        v_turn_number,
        jsonb_build_object(
          'type', 'auto_eliminate',
          'timedOutWallet', v_timed_out_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts',
          'dice', '[]'::jsonb,
          'remainingMoves', '[]'::jsonb
        ),
        v_prev_hash,
        v_move_hash
      );

      v_eliminated := array_append(v_eliminated, v_timed_out_wallet);

      SELECT ARRAY_AGG(p) INTO v_active_players
      FROM unnest(v_participants) AS p
      WHERE p IS NOT NULL 
        AND p != '' 
        AND p != '11111111111111111111111111111111'
        AND NOT (p = ANY(v_eliminated));

      v_player_count := COALESCE(array_length(v_active_players, 1), 0);

      IF v_player_count <= 1 THEN
        v_winner_wallet := v_active_players[1];

        UPDATE game_sessions
        SET status = 'finished',
            status_int = 3,
            winner_wallet = v_winner_wallet,
            game_over_at = NOW(),
            eliminated_players = v_eliminated,
            current_turn_wallet = NULL,
            missed_turns = COALESCE(missed_turns, '{}'::jsonb) || 
                           jsonb_build_object(v_timed_out_wallet, v_new_strikes),
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true,
          'action', 'auto_eliminate_and_finish',
          'timedOutWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'eliminatedPlayers', to_jsonb(v_eliminated),
          'strikes', v_new_strikes
        );
      ELSE
        UPDATE game_sessions
        SET eliminated_players = v_eliminated,
            current_turn_wallet = v_next_wallet,
            turn_started_at = NOW(),
            missed_turns = COALESCE(missed_turns, '{}'::jsonb) || 
                           jsonb_build_object(v_timed_out_wallet, v_new_strikes),
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true,
          'action', 'auto_eliminate',
          'timedOutWallet', v_timed_out_wallet,
          'nextTurnWallet', v_next_wallet,
          'eliminatedPlayers', to_jsonb(v_eliminated),
          'remainingPlayers', v_player_count,
          'strikes', v_new_strikes
        );
      END IF;
    END IF;
  END IF;

  v_move_hash := encode(sha256((v_prev_hash || 
    jsonb_build_object(
      'type', 'turn_timeout',
      'timedOutWallet', v_timed_out_wallet,
      'nextTurnWallet', v_next_wallet,
      'missedCount', v_new_strikes
    )::text)::bytea), 'hex');

  INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
  VALUES (
    p_room_pda,
    v_timed_out_wallet,
    v_turn_number,
    jsonb_build_object(
      'type', 'turn_timeout',
      'timedOutWallet', v_timed_out_wallet,
      'nextTurnWallet', v_next_wallet,
      'missedCount', v_new_strikes,
      'dice', '[]'::jsonb,
      'remainingMoves', '[]'::jsonb
    ),
    v_prev_hash,
    v_move_hash
  );

  UPDATE game_sessions
  SET current_turn_wallet = v_next_wallet,
      turn_started_at = NOW(),
      missed_turns = COALESCE(missed_turns, '{}'::jsonb) || 
                     jsonb_build_object(v_timed_out_wallet, v_new_strikes),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true,
    'action', 'turn_timeout',
    'timedOutWallet', v_timed_out_wallet,
    'nextTurnWallet', v_next_wallet,
    'strikes', v_new_strikes
  );
END;
$$;
