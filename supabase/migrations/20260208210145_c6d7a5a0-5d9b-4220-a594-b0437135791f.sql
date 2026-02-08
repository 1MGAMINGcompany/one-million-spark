-- Add missing columns for net payout calculations to match_share_cards
ALTER TABLE match_share_cards 
  ADD COLUMN IF NOT EXISTS winner_payout_lamports bigint,
  ADD COLUMN IF NOT EXISTS fee_lamports bigint,
  ADD COLUMN IF NOT EXISTS finished_at timestamp with time zone;