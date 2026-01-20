-- Update compute_start_roll to also set turn_started_at when finalizing start roll
CREATE OR REPLACE FUNCTION public.compute_start_roll(p_room_pda text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  p1 text;
  p2 text;
  sig1 text;
  sig2 text;
  seed_text text;
  seed bytea;
  reroll int := 0;
  p1d1 int;
  p2d1 int;
  t1 int;
  t2 int;
  starter text;
  v_session record;
  v_mode text;
BEGIN
  -- Get game session
  SELECT * INTO v_session FROM game_sessions WHERE room_pda = p_room_pda;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game session not found';
  END IF;

  -- If already finalized, return existing result
  IF v_session.start_roll_finalized IS TRUE THEN
    RETURN jsonb_build_object(
      'starting_player_wallet', v_session.starting_player_wallet,
      'start_roll', v_session.start_roll
    );
  END IF;

  p1 := v_session.player1_wallet;
  p2 := v_session.player2_wallet;
  v_mode := v_session.mode;

  IF p2 IS NULL THEN
    RAISE EXCEPTION 'waiting for player2';
  END IF;

  -- Try to get signatures from game_acceptances (for ranked games)
  SELECT signature INTO sig1
  FROM game_acceptances
  WHERE room_pda = p_room_pda AND player_wallet = p1
  ORDER BY created_at DESC LIMIT 1;

  SELECT signature INTO sig2
  FROM game_acceptances
  WHERE room_pda = p_room_pda AND player_wallet = p2
  ORDER BY created_at DESC LIMIT 1;

  -- Deterministic dice roll loop (1 die per player)
  LOOP
    IF sig1 IS NOT NULL AND sig2 IS NOT NULL THEN
      -- Ranked mode: use cryptographic signatures
      seed_text := encode(digest(p_room_pda || '|' || sig1 || '|' || sig2 || '|reroll:' || reroll::text, 'sha256'), 'hex');
    ELSE
      -- Casual mode: use room + wallets + created_at as seed
      seed_text := encode(digest(
        p_room_pda || '|' || p1 || '|' || p2 || '|' || v_session.created_at::text || '|reroll:' || reroll::text, 
        'sha256'
      ), 'hex');
    END IF;
    
    seed := decode(seed_text, 'hex');

    -- Derive 1 die value (1-6) per player from hash bytes
    p1d1 := (get_byte(seed, 0) % 6) + 1;
    p2d1 := (get_byte(seed, 1) % 6) + 1;

    t1 := p1d1;
    t2 := p2d1;

    EXIT WHEN t1 <> t2 OR reroll >= 20;
    reroll := reroll + 1;
  END LOOP;

  -- Determine starter (tie-breaker: p1 wins if still tied after 20 rerolls)
  IF t1 = t2 THEN
    starter := p1;
  ELSE
    starter := CASE WHEN t1 > t2 THEN p1 ELSE p2 END;
  END IF;

  -- Persist the result (now includes turn_started_at)
  UPDATE game_sessions
  SET
    starting_player_wallet = starter,
    current_turn_wallet = starter,
    turn_started_at = now(),
    start_roll_seed = seed_text,
    start_roll_finalized = true,
    start_roll = jsonb_build_object(
      'p1', jsonb_build_object('wallet', p1, 'die', p1d1, 'total', t1),
      'p2', jsonb_build_object('wallet', p2, 'die', p2d1, 'total', t2),
      'reroll_count', reroll,
      'winner', starter
    ),
    updated_at = now()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'starting_player_wallet', starter,
    'start_roll', (SELECT start_roll FROM game_sessions WHERE room_pda = p_room_pda)
  );
END;
$function$;