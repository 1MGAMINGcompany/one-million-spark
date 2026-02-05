-- Update maybe_finalize_start_state to use player1 (creator) for 2-player games
-- For Ludo (3-4 players), keep the random selection

CREATE OR REPLACE FUNCTION public.maybe_finalize_start_state(p_room_pda text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  -- =========== 2-PLAYER GAMES: CREATOR ALWAYS STARTS ===========
  IF v_required_count = 2 THEN
    -- Use player1_wallet (creator) as starting player - no dice roll needed
    v_starting_wallet := v_session.player1_wallet;
    
    -- Update game session atomically
    UPDATE game_sessions
    SET starting_player_wallet = v_starting_wallet,
        current_turn_wallet = v_starting_wallet,
        start_roll_finalized = TRUE,
        turn_started_at = now(),
        start_roll = jsonb_build_object(
          'method', 'creator_starts',
          'chosenWallet', v_starting_wallet,
          'participantCount', 2,
          'at', now()
        ),
        updated_at = now()
    WHERE room_pda = p_room_pda
      AND (start_roll_finalized = FALSE OR start_roll_finalized IS NULL OR starting_player_wallet IS NULL);

    IF FOUND THEN
      RAISE NOTICE '[maybe_finalize_start_state] ✅ 2P Finalized: room=%, creator starts=%', 
        left(p_room_pda, 8), left(v_starting_wallet, 8);
    END IF;
    
    RETURN;
  END IF;
  -- =========== END 2-PLAYER LOGIC ===========

  -- =========== 3-4 PLAYER GAMES (LUDO): RANDOM SELECTION ===========
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
        'method', 'random',
        'index', v_chosen_index - 1, -- 0-indexed for consistency
        'chosenWallet', v_starting_wallet,
        'participantCount', cardinality(v_active_participants),
        'at', now()
      ),
      updated_at = now()
  WHERE room_pda = p_room_pda
    AND (start_roll_finalized = FALSE OR start_roll_finalized IS NULL OR starting_player_wallet IS NULL);

  IF FOUND THEN
    RAISE NOTICE '[maybe_finalize_start_state] ✅ N-player Finalized: room=%, starter=%', 
      left(p_room_pda, 8), left(v_starting_wallet, 8);
  END IF;
END;
$function$;