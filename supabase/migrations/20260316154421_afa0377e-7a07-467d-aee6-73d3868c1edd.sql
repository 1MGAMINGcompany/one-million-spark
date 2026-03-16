ALTER TABLE public.prediction_fights
  ADD COLUMN IF NOT EXISTS home_logo TEXT,
  ADD COLUMN IF NOT EXISTS away_logo TEXT;

ALTER TABLE public.prediction_events
  ADD COLUMN IF NOT EXISTS league_logo TEXT;