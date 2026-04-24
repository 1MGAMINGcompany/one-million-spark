ALTER TABLE public.prediction_entries
ADD COLUMN IF NOT EXISTS stake_tx_hash TEXT;