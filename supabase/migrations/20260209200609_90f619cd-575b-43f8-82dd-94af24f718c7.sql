
CREATE OR REPLACE FUNCTION public.maybe_apply_turn_timeout(p_room_pda text)
RETURNS jsonb
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

  v_deadline := v_session.turn_started_at + 
                (v_session.turn_time_seconds || ' seconds')::INTERVAL;

  -- FIXED: Grace period ADDS 2 seconds (players get full time + grace)
  IF NOW() < v_deadline + INTERVAL '2 seconds' THEN
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

  v_current_strikes := COALESCE(
    (COALESCE(v_session.missed_turns, '{}'::jsonb)->>v_timed_out_wallet)::INTEGER, 0
  );
  v_new_strikes := v_current_strikes + 1;

  SELECT COALESCE(MAX(turn_number), 0) INTO v_turn_number
  FROM game_moves WHERE room_pda = p_room_pda;

  v_turn_number := v_turn_number + 1;
  v_prev_hash := COALESCE(
    (SELECT move_hash FROM game_moves WHERE room_pda = p_room_pda ORDER BY turn_number DESC LIMIT 1),
    'genesis'
  );
  v_move_hash := md5(p_room_pda || v_timed_out_wallet || v_turn_number::TEXT || 'timeout');

  INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, move_hash, prev_hash)
  VALUES (
    p_room_pda, v_timed_out_wallet, v_turn_number,
    jsonb_build_object('type', 'turn_timeout', 'wallet', v_timed_out_wallet, 'strikes', v_new_strikes),
    v_move_hash, v_prev_hash
  );

  IF v_new_strikes >= 3 THEN
    IF v_player_count <= 2 THEN
      v_winner_wallet := v_next_wallet;

      INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, move_hash, prev_hash)
      VALUES (
        p_room_pda, v_timed_out_wallet, v_turn_number + 1,
        jsonb_build_object('type', 'auto_forfeit', 'wallet', v_timed_out_wallet, 'winner', v_winner_wallet),
        md5(p_room_pda || v_timed_out_wallet || (v_turn_number + 1)::TEXT || 'forfeit'),
        v_move_hash
      );

      UPDATE game_sessions
      SET status = 'finished', status_int = 3,
          winner_wallet = v_winner_wallet,
          game_over_at = NOW(),
          missed_turns = jsonb_set(COALESCE(missed_turns, '{}'::jsonb), ARRAY[v_timed_out_wallet], to_jsonb(v_new_strikes)),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;

      RETURN jsonb_build_object(
        'applied', true, 'type', 'auto_forfeit',
        'forfeitedWallet', v_timed_out_wallet,
        'winnerWallet', v_winner_wallet,
        'strikes', v_new_strikes
      );
    ELSE
      v_eliminated := array_append(v_eliminated, v_timed_out_wallet);

      SELECT ARRAY_AGG(p) INTO v_active_players
      FROM unnest(v_participants) AS p
      WHERE p IS NOT NULL AND p != '' AND p != '11111111111111111111111111111111'
        AND NOT (p = ANY(v_eliminated));

      IF array_length(v_active_players, 1) <= 1 THEN
        v_winner_wallet := v_active_players[1];
        UPDATE game_sessions
        SET status = 'finished', status_int = 3,
            winner_wallet = v_winner_wallet,
            game_over_at = NOW(),
            eliminated_players = v_eliminated,
            missed_turns = jsonb_set(COALESCE(missed_turns, '{}'::jsonb), ARRAY[v_timed_out_wallet], to_jsonb(v_new_strikes)),
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true, 'type', 'auto_forfeit',
          'forfeitedWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'strikes', v_new_strikes,
          'eliminated', to_jsonb(v_eliminated)
        );
      END IF;

      -- Find next from remaining active
      v_next_wallet := v_active_players[1];
      FOR i IN 1..array_length(v_active_players, 1) LOOP
        IF v_active_players[i] != v_timed_out_wallet THEN
          v_next_wallet := v_active_players[i];
          EXIT;
        END IF;
      END LOOP;

      UPDATE game_sessions
      SET eliminated_players = v_eliminated,
          missed_turns = jsonb_set(COALESCE(missed_turns, '{}'::jsonb), ARRAY[v_timed_out_wallet], to_jsonb(v_new_strikes)),
          current_turn_wallet = v_next_wallet,
          turn_started_at = NOW(),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;

      RETURN jsonb_build_object(
        'applied', true, 'type', 'eliminated',
        'eliminatedWallet', v_timed_out_wallet,
        'nextTurnWallet', v_next_wallet,
        'strikes', v_new_strikes
      );
    END IF;
  END IF;

  -- Less than 3 strikes: advance turn
  UPDATE game_sessions
  SET missed_turns = jsonb_set(COALESCE(missed_turns, '{}'::jsonb), ARRAY[v_timed_out_wallet], to_jsonb(v_new_strikes)),
      current_turn_wallet = v_next_wallet,
      turn_started_at = NOW(),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true, 'type', 'turn_timeout',
    'timedOutWallet', v_timed_out_wallet,
    'nextTurnWallet', v_next_wallet,
    'strikes', v_new_strikes
  );
END;
$$;
