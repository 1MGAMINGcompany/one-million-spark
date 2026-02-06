-- =====================================================
-- DB-AUTHORITATIVE TURN TIMEOUT & STRIKE TRACKING
-- =====================================================

-- 1. Add missed_turns JSONB column for server-side strike tracking
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS missed_turns JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN game_sessions.missed_turns IS 
  'Server-side strike tracking: {"wallet_address": count}. Reset on successful action.';

-- 2. Create maybe_apply_turn_timeout RPC - idempotent server-side timeout handler
CREATE OR REPLACE FUNCTION public.maybe_apply_turn_timeout(p_room_pda TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
  -- Lock session for atomic update
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'session_not_found');
  END IF;

  -- Skip if game already finished
  IF v_session.status_int >= 3 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'game_finished');
  END IF;

  -- Skip if not active (both players not ready)
  IF NOT (v_session.p1_ready AND v_session.p2_ready) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_active');
  END IF;

  -- Skip if no turn holder
  IF v_session.current_turn_wallet IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_holder');
  END IF;

  -- Skip if turn_started_at is NULL
  IF v_session.turn_started_at IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_start_time');
  END IF;

  -- Calculate deadline (with 2-second grace period)
  v_deadline := v_session.turn_started_at + 
                (v_session.turn_time_seconds || ' seconds')::INTERVAL;

  IF NOW() < v_deadline - INTERVAL '2 seconds' THEN
    RETURN jsonb_build_object(
      'applied', false, 
      'reason', 'not_expired',
      'remaining_seconds', EXTRACT(EPOCH FROM (v_deadline - NOW()))::INTEGER
    );
  END IF;

  -- Timeout expired - process it
  v_timed_out_wallet := v_session.current_turn_wallet;
  
  -- Get participants and eliminated arrays
  v_participants := COALESCE(v_session.participants, ARRAY[v_session.player1_wallet, v_session.player2_wallet]);
  v_eliminated := COALESCE(v_session.eliminated_players, ARRAY[]::TEXT[]);
  
  -- Build active players list (participants minus eliminated)
  SELECT ARRAY_AGG(p) INTO v_active_players
  FROM unnest(v_participants) AS p
  WHERE p IS NOT NULL 
    AND p != '' 
    AND p != '11111111111111111111111111111111'
    AND NOT (p = ANY(v_eliminated));
  
  v_player_count := COALESCE(array_length(v_active_players, 1), 0);
  
  -- Find current player's index in active players
  v_current_idx := NULL;
  FOR i IN 1..v_player_count LOOP
    IF v_active_players[i] = v_timed_out_wallet THEN
      v_current_idx := i;
      EXIT;
    END IF;
  END LOOP;
  
  -- Compute next wallet (circular rotation through active players)
  IF v_player_count <= 1 THEN
    -- Only one player left or no players
    v_next_wallet := NULL;
  ELSIF v_current_idx IS NULL THEN
    -- Current player not found in active list, use first active
    v_next_wallet := v_active_players[1];
  ELSE
    -- Next player in circular order
    v_next_idx := (v_current_idx % v_player_count) + 1;
    v_next_wallet := v_active_players[v_next_idx];
  END IF;
  
  -- Fallback for 2-player games
  IF v_next_wallet IS NULL AND v_session.max_players <= 2 THEN
    IF v_timed_out_wallet = v_session.player1_wallet THEN
      v_next_wallet := v_session.player2_wallet;
    ELSE
      v_next_wallet := v_session.player1_wallet;
    END IF;
  END IF;

  -- Get current strike count and increment
  v_current_strikes := COALESCE(
    (v_session.missed_turns->>v_timed_out_wallet)::INTEGER, 
    0
  );
  v_new_strikes := v_current_strikes + 1;

  -- Calculate turn number and hashes for move insertion
  SELECT COALESCE(MAX(turn_number), 0) + 1, COALESCE(MAX(move_hash), 'genesis')
  INTO v_turn_number, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;

  -- Check for 3 strikes
  IF v_new_strikes >= 3 THEN
    -- === 3 STRIKES HANDLING ===
    
    IF v_session.max_players <= 2 THEN
      -- 2-player game: AUTO FORFEIT - game ends
      v_winner_wallet := v_next_wallet;
      
      -- Insert auto_forfeit move
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

      -- Mark session finished
      UPDATE game_sessions
      SET status = 'finished',
          status_int = 3,
          winner_wallet = v_winner_wallet,
          game_over_at = NOW(),
          missed_turns = jsonb_set(
            COALESCE(missed_turns, '{}'::jsonb),
            ARRAY[v_timed_out_wallet],
            to_jsonb(v_new_strikes)
          ),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;

      RETURN jsonb_build_object(
        'applied', true,
        'type', 'auto_forfeit',
        'timedOutWallet', v_timed_out_wallet,
        'winnerWallet', v_winner_wallet,
        'nextTurnWallet', v_next_wallet,
        'strikes', v_new_strikes
      );
      
    ELSE
      -- 3-4 player game (Ludo): ELIMINATE player, continue game
      
      -- Add to eliminated players
      UPDATE game_sessions
      SET eliminated_players = array_append(
            COALESCE(eliminated_players, ARRAY[]::TEXT[]), 
            v_timed_out_wallet
          ),
          missed_turns = jsonb_set(
            COALESCE(missed_turns, '{}'::jsonb),
            ARRAY[v_timed_out_wallet],
            to_jsonb(v_new_strikes)
          ),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;
      
      -- Recalculate active players after elimination
      SELECT ARRAY_AGG(p) INTO v_active_players
      FROM unnest(v_participants) AS p
      WHERE p IS NOT NULL 
        AND p != '' 
        AND p != '11111111111111111111111111111111'
        AND p != v_timed_out_wallet
        AND NOT (p = ANY(v_eliminated));
      
      v_player_count := COALESCE(array_length(v_active_players, 1), 0);
      
      IF v_player_count <= 1 THEN
        -- Only one player left - they win
        v_winner_wallet := v_active_players[1];
        
        -- Insert elimination + game end move
        v_move_hash := encode(sha256((v_prev_hash || 
          jsonb_build_object(
            'type', 'auto_forfeit',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
            'winnerWallet', v_winner_wallet,
            'missedCount', v_new_strikes,
            'reason', 'last_player_standing'
          )::text)::bytea), 'hex');

        INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
        VALUES (
          p_room_pda,
          v_timed_out_wallet,
          v_turn_number,
          jsonb_build_object(
            'type', 'auto_forfeit',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
            'winnerWallet', v_winner_wallet,
            'missedCount', v_new_strikes,
            'reason', 'last_player_standing',
            'dice', '[]'::jsonb,
            'remainingMoves', '[]'::jsonb
          ),
          v_prev_hash,
          v_move_hash
        );
        
        -- Mark session finished
        UPDATE game_sessions
        SET status = 'finished',
            status_int = 3,
            winner_wallet = v_winner_wallet,
            game_over_at = NOW(),
            current_turn_wallet = NULL,
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true,
          'type', 'auto_forfeit',
          'timedOutWallet', v_timed_out_wallet,
          'eliminatedWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'strikes', v_new_strikes,
          'reason', 'last_player_standing'
        );
      ELSE
        -- Game continues - find next player
        v_next_wallet := v_active_players[1]; -- First remaining active player
        
        -- Insert elimination move
        v_move_hash := encode(sha256((v_prev_hash || 
          jsonb_build_object(
            'type', 'player_eliminated',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
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
            'type', 'player_eliminated',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
            'nextTurnWallet', v_next_wallet,
            'missedCount', v_new_strikes,
            'reason', 'three_consecutive_timeouts',
            'dice', '[]'::jsonb,
            'remainingMoves', '[]'::jsonb
          ),
          v_prev_hash,
          v_move_hash
        );
        
        -- Update session - move to next player
        UPDATE game_sessions
        SET current_turn_wallet = v_next_wallet,
            turn_started_at = NOW(),
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true,
          'type', 'player_eliminated',
          'timedOutWallet', v_timed_out_wallet,
          'eliminatedWallet', v_timed_out_wallet,
          'nextTurnWallet', v_next_wallet,
          'strikes', v_new_strikes,
          'remainingPlayers', v_player_count
        );
      END IF;
    END IF;
  END IF;

  -- Less than 3 strikes - just skip turn
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

  -- Update session: switch turn, reset timer, update strikes
  UPDATE game_sessions
  SET current_turn_wallet = v_next_wallet,
      turn_started_at = NOW(),
      missed_turns = jsonb_set(
        COALESCE(missed_turns, '{}'::jsonb),
        ARRAY[v_timed_out_wallet],
        to_jsonb(v_new_strikes)
      ),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true,
    'type', 'turn_timeout',
    'timedOutWallet', v_timed_out_wallet,
    'nextTurnWallet', v_next_wallet,
    'strikes', v_new_strikes
  );
END;
$$;

-- 3. Update submit_game_move to reset strikes on successful action
CREATE OR REPLACE FUNCTION public.submit_game_move(p_room_pda text, p_wallet text, p_move_data jsonb, p_client_move_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- Extract move type
  v_move_type := p_move_data->>'type';

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
    
    -- Caller cannot time out themselves
    IF v_timeout_wallet = p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'cannot_timeout_self');
    END IF;
    
    -- Must target current turn holder
    IF v_session.current_turn_wallet != v_timeout_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'wrong_timeout_target');
    END IF;
    
    -- Verify timeout is actually expired (with 2 second grace)
    v_turn_deadline := v_session.turn_started_at + (v_session.turn_time_seconds || ' seconds')::INTERVAL;
    IF NOW() < v_turn_deadline - INTERVAL '2 seconds' THEN
      RETURN jsonb_build_object('success', false, 'error', 'timeout_too_early');
    END IF;
    
    -- Dedupe: check if a timeout was already recorded for this turn
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda
        AND (move_data->>'type') = 'turn_timeout'
        AND wallet = v_timeout_wallet
        AND turn_number >= v_session.status_int -- rough dedupe by turn context
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
  -- RESET STRIKES ON SUCCESSFUL ACTION (dice_roll, move, turn_end)
  -- =====================================================
  IF v_move_type IN ('dice_roll', 'move', 'turn_end') THEN
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
    -- Game over - mark session as finished
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
    -- Manual forfeit - actor is the loser
    -- Derive winner as the other player
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
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'turn_number', v_turn_number,
    'move_hash', v_move_hash
  );
END;
$$;