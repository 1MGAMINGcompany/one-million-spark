-- Add unique constraint on polymarket_user_positions for proper upsert
CREATE UNIQUE INDEX IF NOT EXISTS polymarket_user_positions_wallet_condition_outcome_idx 
  ON public.polymarket_user_positions (wallet, condition_id, outcome_index);