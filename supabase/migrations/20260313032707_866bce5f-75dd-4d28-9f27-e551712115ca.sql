CREATE OR REPLACE FUNCTION public.prediction_update_pool(
  p_fight_id uuid,
  p_pool_lamports bigint,
  p_shares bigint,
  p_side text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_side = 'fighter_a' THEN
    UPDATE prediction_fights
    SET pool_a_lamports = pool_a_lamports + p_pool_lamports,
        shares_a = shares_a + p_shares,
        updated_at = now()
    WHERE id = p_fight_id;
  ELSIF p_side = 'fighter_b' THEN
    UPDATE prediction_fights
    SET pool_b_lamports = pool_b_lamports + p_pool_lamports,
        shares_b = shares_b + p_shares,
        updated_at = now()
    WHERE id = p_fight_id;
  ELSE
    RAISE EXCEPTION 'Invalid side: %', p_side;
  END IF;
END;
$$;