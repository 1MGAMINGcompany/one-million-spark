-- Fix search_path for rebuild_participants function
CREATE OR REPLACE FUNCTION public.rebuild_participants(
  p_player1 text,
  p_player2 text,
  p_existing_participants text[],
  p_max_players int
) RETURNS text[]
LANGUAGE plpgsql 
IMMUTABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_result text[] := '{}';
  v_wallet text;
BEGIN
  -- For 2-player games: always [player1, player2] (non-null only)
  IF p_max_players <= 2 THEN
    IF p_player1 IS NOT NULL AND p_player1 <> '' THEN
      v_result := array_append(v_result, p_player1);
    END IF;
    IF p_player2 IS NOT NULL AND p_player2 <> '' THEN
      v_result := array_append(v_result, p_player2);
    END IF;
    RETURN v_result;
  END IF;
  
  -- For Ludo (3-4 players): preserve existing order, append new wallets
  FOREACH v_wallet IN ARRAY COALESCE(p_existing_participants, '{}')
  LOOP
    IF v_wallet IS NOT NULL AND v_wallet <> '' AND NOT (v_wallet = ANY(v_result)) THEN
      v_result := array_append(v_result, v_wallet);
    END IF;
  END LOOP;
  
  IF p_player1 IS NOT NULL AND p_player1 <> '' AND NOT (p_player1 = ANY(v_result)) THEN
    v_result := array_append(v_result, p_player1);
  END IF;
  
  IF p_player2 IS NOT NULL AND p_player2 <> '' AND NOT (p_player2 = ANY(v_result)) THEN
    v_result := array_append(v_result, p_player2);
  END IF;
  
  RETURN v_result;
END;
$fn$;