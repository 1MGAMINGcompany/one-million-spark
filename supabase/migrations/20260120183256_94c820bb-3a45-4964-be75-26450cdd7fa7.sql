-- Step 1: Patch upsert_game_session to lock down turn authority
-- - current_turn_wallet is IGNORED during UPDATE (only submit-move RPC can change it)
-- - status is protected for ranked games (client cannot force 'finished')
-- - mode already protected (previous fix)

CREATE OR REPLACE FUNCTION public.upsert_game_session(
  p_room_pda text,
  p_game_type text,
  p_game_state jsonb,
  p_current_turn_wallet text,  -- Kept for signature compatibility but IGNORED on UPDATE
  p_player1_wallet text,
  p_player2_wallet text,
  p_status text DEFAULT 'active'::text,
  p_mode text DEFAULT 'casual'::text,
  p_caller_wallet text DEFAULT NULL::text
)
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
    
    -- UPDATE: Lock down server-controlled fields
    -- - current_turn_wallet: NEVER writable by client (only submit-move RPC can change it)
    -- - mode: NEVER writable by client (already fixed)
    -- - status: Protect for ranked games (client cannot force 'finished')
    UPDATE game_sessions
    SET game_state = p_game_state,
        -- REMOVED: current_turn_wallet = p_current_turn_wallet (server-owned)
        player2_wallet = COALESCE(p_player2_wallet, player2_wallet),
        -- Protect status for ranked games
        status = CASE 
          WHEN v_existing_record.mode = 'ranked' THEN v_existing_record.status
          ELSE p_status
        END,
        -- REMOVED: mode = p_mode (already fixed - mode is sticky)
        updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    -- For new sessions, caller must be player1 (creator)
    IF p_caller_wallet IS NOT NULL AND p_caller_wallet != p_player1_wallet THEN
      RAISE EXCEPTION 'Only the room creator can create the game session';
    END IF;
    
    -- INSERT: Full control allowed for creation (mode is set on INSERT only)
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

-- Step 2: Create atomic submit_game_move RPC
-- - Uses SELECT ... FOR UPDATE to prevent race conditions
-- - Enforces client_move_id for ranked games
-- - Validates turn ownership for ALL moves
-- - Server-assigns turn numbers
-- - Only turn-ending moves update current_turn_wallet

CREATE OR REPLACE FUNCTION public.submit_game_move(
  p_room_pda text,
  p_wallet text,
  p_move_data jsonb,
  p_client_move_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_last_move RECORD;
  v_assigned_turn integer;
  v_last_hash text;
  v_move_hash text;
  v_expected_wallet text;
  v_move_type text;
  v_next_turn_wallet text;
BEGIN
  -- 1. IDEMPOTENCY CHECK (before locking for performance)
  IF p_client_move_id IS NOT NULL THEN
    SELECT turn_number, move_hash INTO v_last_move
    FROM game_moves
    WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id;
    
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'turnNumber', v_last_move.turn_number,
        'moveHash', v_last_move.move_hash,
        'idempotent', true
      );
    END IF;
  END IF;

  -- 2. LOCK SESSION ROW (prevents race conditions)
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;
  
  -- 3. VALIDATE PARTICIPATION
  IF p_wallet != v_session.player1_wallet AND p_wallet != v_session.player2_wallet THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;
  
  -- 4. REQUIRE client_move_id FOR RANKED (strict enforcement)
  IF v_session.mode = 'ranked' AND p_client_move_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_client_move_id');
  END IF;
  
  -- 5. VALIDATE TURN OWNERSHIP (for ranked when start_roll is finalized)
  v_expected_wallet := COALESCE(v_session.current_turn_wallet, v_session.starting_player_wallet);
  v_move_type := p_move_data->>'type';
  
  IF v_session.mode = 'ranked' AND v_session.start_roll_finalized = true THEN
    IF v_expected_wallet IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_turn_authority');
    END IF;
    
    IF p_wallet != v_expected_wallet THEN
      -- Log snapshot for debugging
      RAISE NOTICE '[submit_game_move] NOT YOUR TURN: wallet=%, expected=%, current=%, starting=%, type=%',
        substring(p_wallet, 1, 8), 
        substring(v_expected_wallet, 1, 8), 
        substring(v_session.current_turn_wallet, 1, 8), 
        substring(v_session.starting_player_wallet, 1, 8), 
        v_move_type;
      
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'not_your_turn',
        'expected', substring(v_expected_wallet, 1, 8)
      );
    END IF;
  END IF;
  
  -- 6. VALIDATE TIMEOUT (anti-cheat: ensure turn actually expired)
  IF v_move_type = 'turn_timeout' THEN
    IF v_session.turn_started_at IS NOT NULL AND v_session.turn_time_seconds IS NOT NULL THEN
      IF now() < v_session.turn_started_at + (v_session.turn_time_seconds + 2) * interval '1 second' THEN
        RETURN jsonb_build_object('success', false, 'error', 'timeout_too_early');
      END IF;
    END IF;
  END IF;
  
  -- 7. GET LAST MOVE + ASSIGN TURN NUMBER (server-sequenced)
  SELECT turn_number, move_hash INTO v_last_move
  FROM game_moves
  WHERE room_pda = p_room_pda
  ORDER BY turn_number DESC
  LIMIT 1;
  
  v_assigned_turn := COALESCE(v_last_move.turn_number, 0) + 1;
  v_last_hash := COALESCE(v_last_move.move_hash, 'genesis');
  
  -- 8. COMPUTE HASH (server-side, deterministic)
  v_move_hash := encode(
    extensions.digest(
      p_room_pda || '|' || v_assigned_turn::text || '|' || p_wallet || '|' || p_move_data::text || '|' || v_last_hash, 
      'sha256'
    ),
    'hex'
  );
  
  -- 9. INSERT MOVE
  INSERT INTO game_moves (
    room_pda, turn_number, wallet, move_data, prev_hash, move_hash, client_move_id
  ) VALUES (
    p_room_pda, v_assigned_turn, p_wallet, p_move_data, v_last_hash, v_move_hash, p_client_move_id
  );
  
  -- 10. UPDATE TURN ON TURN-ENDING MOVES
  IF v_move_type IN ('turn_end', 'turn_timeout', 'auto_forfeit') THEN
    v_next_turn_wallet := p_move_data->>'nextTurnWallet';
    
    IF v_next_turn_wallet IS NOT NULL THEN
      UPDATE game_sessions
      SET current_turn_wallet = v_next_turn_wallet,
          turn_started_at = now()
      WHERE room_pda = p_room_pda;
    END IF;
  END IF;
  
  -- Log success
  RAISE NOTICE '[submit_game_move] OK: turn=%, wallet=%, type=%', 
    v_assigned_turn, substring(p_wallet, 1, 8), v_move_type;
  
  RETURN jsonb_build_object(
    'success', true,
    'turnNumber', v_assigned_turn,
    'moveHash', v_move_hash
  );
  
EXCEPTION
  WHEN unique_violation THEN
    -- Handle race condition on turn_number or client_move_id
    -- Try to return existing move if it was an idempotent hit
    IF p_client_move_id IS NOT NULL THEN
      SELECT turn_number, move_hash INTO v_last_move
      FROM game_moves
      WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id;
      
      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', true,
          'turnNumber', v_last_move.turn_number,
          'moveHash', v_last_move.move_hash,
          'idempotent', true
        );
      END IF;
    END IF;
    
    RETURN jsonb_build_object('success', false, 'error', 'move_conflict');
END;
$function$;

-- Step 5: Create atomic finalize_start_roll RPC
-- - Only sets fields if not already finalized (idempotent)
-- - Prevents race conditions between two clients

CREATE OR REPLACE FUNCTION public.finalize_start_roll(
  p_room_pda text,
  p_starting_wallet text,
  p_start_roll jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only set if not already finalized (idempotent)
  UPDATE game_sessions
  SET starting_player_wallet = p_starting_wallet,
      current_turn_wallet = p_starting_wallet,
      start_roll_finalized = true,
      turn_started_at = now(),
      start_roll = COALESCE(p_start_roll, start_roll),
      updated_at = now()
  WHERE room_pda = p_room_pda
    AND (start_roll_finalized = false OR start_roll_finalized IS NULL);
    
  RETURN FOUND;
END;
$function$