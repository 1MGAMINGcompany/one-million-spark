-- Update maybe_finalize_start_state: Creator ALWAYS starts (all game sizes)
-- Removes random selection for 3-4 player Ludo games

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

  -- =========== ALL GAMES: CREATOR ALWAYS STARTS ===========
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
        'participantCount', v_participants_count,
        'maxPlayers', v_required_count,
        'at', now()
      ),
      updated_at = now()
  WHERE room_pda = p_room_pda
    AND (start_roll_finalized = FALSE OR start_roll_finalized IS NULL OR starting_player_wallet IS NULL);

  IF FOUND THEN
    RAISE NOTICE '[maybe_finalize_start_state] ✅ Finalized: room=%, creator starts=%, players=%', 
      left(p_room_pda, 8), left(v_starting_wallet, 8), v_required_count;
  END IF;
END;
$function$;