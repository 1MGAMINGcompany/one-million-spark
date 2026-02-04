-- =============================================================================
-- P0: Auto-activate game_sessions when room is ready (status_int 1→2)
-- Safe for: casual, ranked, private; all games; Ludo 2/3/4 players
-- =============================================================================

-- 1) Helper function: maybe_activate_game_session
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
    -- Already active (2) or finished (3), do not touch
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
  END IF;
END;
$$;

-- 2) Trigger function for game_acceptances
CREATE OR REPLACE FUNCTION public.trigger_maybe_activate_on_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Call activation check for the affected room
  PERFORM maybe_activate_game_session(NEW.room_pda);
  RETURN NEW;
END;
$$;

-- 3) Create trigger on game_acceptances (drop if exists first)
DROP TRIGGER IF EXISTS trg_maybe_activate_on_acceptance ON public.game_acceptances;

CREATE TRIGGER trg_maybe_activate_on_acceptance
AFTER INSERT OR UPDATE ON public.game_acceptances
FOR EACH ROW
EXECUTE FUNCTION public.trigger_maybe_activate_on_acceptance();

-- 4) Update record_acceptance to call maybe_activate_game_session at the end
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
  
  -- Attempt to activate the game session (idempotent, fast convergence)
  PERFORM maybe_activate_game_session(p_room_pda);
  
  RETURN jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at
  );
END;
$function$;