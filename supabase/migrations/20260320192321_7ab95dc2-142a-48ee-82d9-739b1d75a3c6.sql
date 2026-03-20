ALTER TABLE prediction_fights 
  ADD COLUMN IF NOT EXISTS fighter_a_record text,
  ADD COLUMN IF NOT EXISTS fighter_b_record text,
  ADD COLUMN IF NOT EXISTS venue text,
  ADD COLUMN IF NOT EXISTS referee text,
  ADD COLUMN IF NOT EXISTS event_banner_url text;

ALTER TABLE prediction_events
  ADD COLUMN IF NOT EXISTS event_banner_url text,
  ADD COLUMN IF NOT EXISTS venue text;