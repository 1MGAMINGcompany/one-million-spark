
CREATE OR REPLACE FUNCTION public.maybe_apply_waiting_timeout(p_room_pda text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_deadline TIMESTAMPTZ;
  v_participant_count INTEGER;
  v_waiting_timeout_seconds INTEGER := 900;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'session_not_found');
  END IF;

  IF v_session.status_int != 1 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_waiting');
  END IF;

  SELECT COUNT(*) INTO v_participant_count
  FROM unnest(COALESCE(v_session.participants, ARRAY[]::TEXT[])) AS p
  WHERE p IS NOT NULL 
    AND p != '' 
    AND p != '11111111111111111111111111111111';

  IF v_participant_count >= 2 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'has_opponent');
  END IF;

  IF v_session.waiting_started_at IS NULL THEN
    v_session.waiting_started_at := v_session.created_at;
  END IF;

  v_deadline := v_session.waiting_started_at + 
                (v_waiting_timeout_seconds || ' seconds')::INTERVAL;

  IF NOW() < v_deadline THEN
    RETURN jsonb_build_object(
      'applied', false, 
      'reason', 'not_expired',
      'remaining_seconds', EXTRACT(EPOCH FROM (v_deadline - NOW()))::INTEGER
    );
  END IF;

  UPDATE game_sessions
  SET status = 'cancelled',
      status_int = 5,
      game_over_at = NOW(),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true,
    'action', 'cancelled',
    'creatorWallet', v_session.player1_wallet,
    'reason', 'opponent_no_show'
  );
END;
$function$;
