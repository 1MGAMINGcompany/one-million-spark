-- =============================================================================
-- P0: Auto-finalize start state when room becomes ready (no dice UI)
-- Fairness: server-side randomness, idempotent, works for all games + modes
-- =============================================================================

-- 1) Create the maybe_finalize_start_state function
CREATE OR REPLACE FUNCTION public.maybe_finalize_start_state(p_room_pda text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_session RECORD;
  v_required_count INT;
  v_accepted_count INT;
  v_participants_count INT;
  v_active_participants TEXT[];
  v_eliminated_set TEXT[];
  v_random_byte INT;
  v_chosen_index INT;
  v_starting_wallet TEXT;
BEGIN
  -- Lock and fetch session
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  -- Exit if not found
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Exit if already finalized with a starting player
  IF v_session.start_roll_finalized = TRUE AND v_session.starting_player_wallet IS NOT NULL THEN
    RETURN;
  END IF;

  -- Determine required count from max_players (minimum 2)
  v_required_count := GREATEST(2, v_session.max_players);

  -- Count acceptances for this room
  SELECT COUNT(*) INTO v_accepted_count
  FROM game_acceptances
  WHERE room_pda = p_room_pda;

  -- Count participants from array
  v_participants_count := COALESCE(cardinality(v_session.participants), 0);

  -- Check if room is ready (both thresholds met)
  IF v_accepted_count < v_required_count OR v_participants_count < v_required_count THEN
    -- Not ready yet
    RETURN;
  END IF;

  -- Build active participants list (exclude eliminated players)
  v_eliminated_set := COALESCE(v_session.eliminated_players, '{}');
  
  SELECT array_agg(p) INTO v_active_participants
  FROM unnest(v_session.participants) AS p
  WHERE NOT (p = ANY(v_eliminated_set));

  -- Validate we have active participants
  IF v_active_participants IS NULL OR cardinality(v_active_participants) = 0 THEN
    RETURN;
  END IF;

  -- Pick random starting player using pgcrypto
  v_random_byte := get_byte(extensions.gen_random_bytes(1), 0);
  v_chosen_index := (v_random_byte % cardinality(v_active_participants)) + 1; -- 1-indexed for array access
  v_starting_wallet := v_active_participants[v_chosen_index];

  -- Update game session atomically
  UPDATE game_sessions
  SET starting_player_wallet = v_starting_wallet,
      current_turn_wallet = v_starting_wallet,
      start_roll_finalized = TRUE,
      turn_started_at = now(),
      start_roll = jsonb_build_object(
        'method', 'auto',
        'index', v_chosen_index - 1, -- 0-indexed for consistency
        'chosenWallet', v_starting_wallet,
        'participantCount', cardinality(v_active_participants),
        'at', now()
      ),
      updated_at = now()
  WHERE room_pda = p_room_pda
    AND (start_roll_finalized = FALSE OR start_roll_finalized IS NULL OR starting_player_wallet IS NULL);

  IF FOUND THEN
    RAISE NOTICE '[maybe_finalize_start_state] ✅ Finalized: room=%, starter=%', 
      left(p_room_pda, 8), left(v_starting_wallet, 8);
  END IF;
END;
$$;

-- 2) Update maybe_activate_game_session to call maybe_finalize_start_state after activation
CREATE OR REPLACE FUNCTION public.maybe_activate_game_session(p_room_pda text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
  v_required_count INT;
  v_accepted_count INT;
  v_participants_count INT;
  v_did_activate BOOLEAN := FALSE;
BEGIN
  -- Lock and fetch session
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  -- Exit if not found or already active/finished
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  IF v_session.status_int >= 2 THEN
    -- Already active (2) or finished (3)
    -- Still try to finalize start state in case it wasn't done
    PERFORM maybe_finalize_start_state(p_room_pda);
    RETURN;
  END IF;

  -- Determine required count from max_players (minimum 2)
  v_required_count := GREATEST(2, v_session.max_players);

  -- Count acceptances for this room
  SELECT COUNT(*) INTO v_accepted_count
  FROM game_acceptances
  WHERE room_pda = p_room_pda;

  -- Count participants from array
  v_participants_count := COALESCE(cardinality(v_session.participants), 0);

  -- Activate if both thresholds met and still in waiting state
  IF v_accepted_count >= v_required_count 
     AND v_participants_count >= v_required_count 
     AND v_session.status_int = 1 THEN
    UPDATE game_sessions
    SET status_int = 2,
        status = 'active',
        updated_at = now()
    WHERE room_pda = p_room_pda
      AND status_int = 1;  -- Double-check to prevent race conditions
    
    v_did_activate := TRUE;
  END IF;

  -- Finalize start state (idempotent - will check readiness again)
  PERFORM maybe_finalize_start_state(p_room_pda);
END;
$$;

-- 3) Update the trigger function to also call maybe_finalize_start_state
CREATE OR REPLACE FUNCTION public.trigger_maybe_activate_on_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Call activation check for the affected room
  PERFORM maybe_activate_game_session(NEW.room_pda);
  -- maybe_activate_game_session now calls maybe_finalize_start_state internally
  RETURN NEW;
END;
$$;

-- 4) Also update record_acceptance to ensure fast convergence
CREATE OR REPLACE FUNCTION public.record_acceptance(p_room_pda text, p_wallet text, p_tx_signature text, p_rules_hash text, p_stake_lamports bigint, p_is_creator boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_existing_p2 TEXT;
  v_nonce TEXT;
BEGIN
  -- Generate session token and expiry
  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '4 hours';
  v_nonce := encode(extensions.gen_random_bytes(16), 'hex');
  
  IF p_is_creator THEN
    -- Creator acceptance
    UPDATE game_sessions
    SET p1_acceptance_tx = p_tx_signature,
        p1_ready = TRUE,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    -- Joiner acceptance: protect against overwriting different player2
    SELECT player2_wallet INTO v_existing_p2
    FROM game_sessions
    WHERE room_pda = p_room_pda;
    
    -- Only update player2_wallet if null/empty or same wallet
    IF v_existing_p2 IS NULL OR v_existing_p2 = '' OR v_existing_p2 = p_wallet THEN
      UPDATE game_sessions
      SET p2_acceptance_tx = p_tx_signature,
          p2_ready = TRUE,
          player2_wallet = p_wallet,
          updated_at = NOW()
      WHERE room_pda = p_room_pda;
    ELSE
      -- Different player2 already exists - just mark ready flags
      -- This handles Ludo where we have 3-4 players
      UPDATE game_sessions
      SET updated_at = NOW()
      WHERE room_pda = p_room_pda;
    END IF;
  END IF;
  
  -- Insert into player_sessions (idempotent on room_pda+wallet)
  INSERT INTO player_sessions (room_pda, wallet, session_token, rules_hash, last_turn, last_hash)
  VALUES (p_room_pda, p_wallet, v_session_token, p_rules_hash, 0, NULL)
  ON CONFLICT (room_pda, wallet) 
  DO UPDATE SET 
    session_token = v_session_token,
    rules_hash = p_rules_hash,
    revoked = FALSE,
    last_move_at = NOW();
  
  -- Insert into game_acceptances (idempotent on room_pda+player_wallet)
  INSERT INTO game_acceptances (
    room_pda, player_wallet, rules_hash, nonce, signature, 
    session_token, timestamp_ms, session_expires_at
  ) VALUES (
    p_room_pda, p_wallet, p_rules_hash, v_nonce, p_tx_signature,
    v_session_token, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, v_expires_at
  )
  ON CONFLICT (room_pda, player_wallet)
  DO UPDATE SET
    signature = EXCLUDED.signature,
    session_token = EXCLUDED.session_token,
    session_expires_at = EXCLUDED.session_expires_at,
    nonce = EXCLUDED.nonce;
  
  -- Attempt to activate + finalize start state (idempotent, fast convergence)
  PERFORM maybe_activate_game_session(p_room_pda);
  
  RETURN jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at
  );
END;
$function$;