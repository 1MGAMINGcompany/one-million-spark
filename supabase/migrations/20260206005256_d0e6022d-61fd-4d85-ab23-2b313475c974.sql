-- Update maybe_finalize_start_state to use participants array as primary signal
-- If participants count >= max_players, auto-start regardless of game_acceptances count

CREATE OR REPLACE FUNCTION public.maybe_finalize_start_state(p_room_pda text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_required_count INT;
  v_participants_count INT;
  v_acceptances_count INT;
BEGIN
  -- Get session with lock
  SELECT *
  INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  -- If already finalized, skip
  IF v_session.start_roll_finalized = true THEN
    RAISE NOTICE '[maybe_finalize] Already finalized for %', LEFT(p_room_pda, 8);
    RETURN;
  END IF;

  -- Determine required count from max_players
  v_required_count := COALESCE(v_session.max_players, 2);
  
  -- Count from participants array (synced from on-chain, authoritative)
  v_participants_count := COALESCE(array_length(v_session.participants, 1), 0);
  
  -- Count from game_acceptances (secondary signal)
  SELECT COUNT(DISTINCT player_wallet) INTO v_acceptances_count
  FROM game_acceptances
  WHERE room_pda = p_room_pda;

  RAISE NOTICE '[maybe_finalize] Room % - participants: %/%, acceptances: %/%',
    LEFT(p_room_pda, 8), v_participants_count, v_required_count, v_acceptances_count, v_required_count;

  -- PRIMARY SIGNAL: Use participants array (on-chain authoritative)
  -- If participants is full, the game should start immediately
  -- game_acceptances may fail due to network issues, but on-chain is truth
  IF v_participants_count < v_required_count THEN
    -- Not enough players on-chain yet, wait
    RAISE NOTICE '[maybe_finalize] Waiting for on-chain participants (have %, need %)', v_participants_count, v_required_count;
    RETURN;
  END IF;

  -- Participants array is full - auto-start with creator first
  RAISE NOTICE '[maybe_finalize] Starting game - participants array full';

  -- Update session: set start_roll_finalized, starting_player, current_turn, and status
  UPDATE game_sessions
  SET
    start_roll_finalized = true,
    starting_player_wallet = v_session.player1_wallet,
    current_turn_wallet = v_session.player1_wallet,
    turn_started_at = NOW(),
    status = 'active',
    status_int = 2,
    p1_ready = true,
    p2_ready = true,
    updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RAISE NOTICE '[maybe_finalize] Game started for room % - creator % goes first',
    LEFT(p_room_pda, 8), LEFT(v_session.player1_wallet, 8);
END;
$$;