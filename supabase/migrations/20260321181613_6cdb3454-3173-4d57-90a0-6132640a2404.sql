ALTER TABLE public.prediction_fights
  ADD COLUMN IF NOT EXISTS polymarket_liquidity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS polymarket_volume_24h numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS polymarket_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS polymarket_competitive numeric,
  ADD COLUMN IF NOT EXISTS polymarket_fee text;