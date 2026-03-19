
-- Add USD columns to prediction_fights (keep old lamports columns temporarily)
ALTER TABLE public.prediction_fights
  ADD COLUMN IF NOT EXISTS pool_a_usd numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pool_b_usd numeric(18,6) NOT NULL DEFAULT 0;

-- Add USD columns to prediction_entries
ALTER TABLE public.prediction_entries
  ADD COLUMN IF NOT EXISTS amount_usd numeric(18,6),
  ADD COLUMN IF NOT EXISTS fee_usd numeric(18,6),
  ADD COLUMN IF NOT EXISTS pool_usd numeric(18,6),
  ADD COLUMN IF NOT EXISTS reward_usd numeric(18,6);

-- Add comments marking old columns as deprecated
COMMENT ON COLUMN public.prediction_fights.pool_a_lamports IS 'DEPRECATED: Legacy Solana lamports. Use pool_a_usd for new predictions.';
COMMENT ON COLUMN public.prediction_fights.pool_b_lamports IS 'DEPRECATED: Legacy Solana lamports. Use pool_b_usd for new predictions.';
COMMENT ON COLUMN public.prediction_entries.amount_lamports IS 'DEPRECATED: Legacy Solana lamports. Use amount_usd for new predictions.';
COMMENT ON COLUMN public.prediction_entries.fee_lamports IS 'DEPRECATED: Legacy Solana lamports. Use fee_usd for new predictions.';
COMMENT ON COLUMN public.prediction_entries.pool_lamports IS 'DEPRECATED: Legacy Solana lamports. Use pool_usd for new predictions.';
COMMENT ON COLUMN public.prediction_entries.reward_lamports IS 'DEPRECATED: Legacy Solana lamports. Use reward_usd for new predictions.';

-- Create new USD-based pool update function
CREATE OR REPLACE FUNCTION public.prediction_update_pool_usd(
  p_fight_id uuid,
  p_pool_usd numeric,
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
    SET pool_a_usd = pool_a_usd + p_pool_usd,
        shares_a = shares_a + p_shares,
        updated_at = now()
    WHERE id = p_fight_id;
  ELSIF p_side = 'fighter_b' THEN
    UPDATE prediction_fights
    SET pool_b_usd = pool_b_usd + p_pool_usd,
        shares_b = shares_b + p_shares,
        updated_at = now()
    WHERE id = p_fight_id;
  ELSE
    RAISE EXCEPTION 'Invalid side: %', p_side;
  END IF;
END;
$$;
