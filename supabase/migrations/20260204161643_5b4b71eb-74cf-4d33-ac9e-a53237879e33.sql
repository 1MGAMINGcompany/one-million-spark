-- Backfill: Activate and finalize waiting rooms that are already ready
-- Safe to run multiple times (idempotent via existing function guards)

DO $$
DECLARE
  v_room RECORD;
  v_required_count INT;
  v_accepted_count INT;
  v_participants_count INT;
  v_processed INT := 0;
  v_activated INT := 0;
  v_finalized INT := 0;
BEGIN
  RAISE NOTICE '[backfill] Starting scan for stuck waiting rooms...';

  -- Find all waiting rooms (status_int = 1)
  FOR v_room IN 
    SELECT room_pda, max_players, participants, status_int, start_roll_finalized, starting_player_wallet
    FROM game_sessions
    WHERE status_int = 1
  LOOP
    -- Compute required count
    v_required_count := GREATEST(2, COALESCE(v_room.max_players, 2));
    
    -- Count participants
    v_participants_count := COALESCE(cardinality(v_room.participants), 0);
    
    -- Count acceptances for this room
    SELECT COUNT(*) INTO v_accepted_count
    FROM game_acceptances
    WHERE room_pda = v_room.room_pda;
    
    -- Check if ready by counts
    IF v_participants_count >= v_required_count AND v_accepted_count >= v_required_count THEN
      RAISE NOTICE '[backfill] Activating room % (participants=%, accepted=%, required=%)', 
        left(v_room.room_pda, 8), v_participants_count, v_accepted_count, v_required_count;
      
      -- Call activation (also calls finalize internally)
      PERFORM maybe_activate_game_session(v_room.room_pda);
      v_activated := v_activated + 1;
    END IF;
    
    v_processed := v_processed + 1;
  END LOOP;

  RAISE NOTICE '[backfill] Processed % waiting rooms, activated %', v_processed, v_activated;

  -- Second pass: ensure start_roll_finalized for any active rooms missing it
  FOR v_room IN
    SELECT room_pda, status_int, start_roll_finalized, starting_player_wallet
    FROM game_sessions
    WHERE status_int >= 2
      AND (start_roll_finalized IS NOT TRUE OR starting_player_wallet IS NULL)
  LOOP
    RAISE NOTICE '[backfill] Finalizing start state for room %', left(v_room.room_pda, 8);
    PERFORM maybe_finalize_start_state(v_room.room_pda);
    v_finalized := v_finalized + 1;
  END LOOP;

  RAISE NOTICE '[backfill] Finalized start state for % rooms', v_finalized;
  RAISE NOTICE '[backfill] Complete!';
END $$;