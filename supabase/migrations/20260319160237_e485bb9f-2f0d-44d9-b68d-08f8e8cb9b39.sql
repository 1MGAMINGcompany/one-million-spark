-- Add commission_bps and enrichment columns to prediction_fights
ALTER TABLE public.prediction_fights
  ADD COLUMN IF NOT EXISTS commission_bps integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS enrichment_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fighter_a_photo text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fighter_b_photo text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stats_json jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS explainer_card text DEFAULT NULL;

-- Add enrichment columns to prediction_events  
ALTER TABLE public.prediction_events
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;

-- Set commission_bps = 200 for all existing Polymarket-sourced fights
UPDATE public.prediction_fights SET commission_bps = 200 WHERE source = 'polymarket';

COMMENT ON COLUMN public.prediction_fights.commission_bps IS 'Platform fee in basis points: 200 for polymarket imports, 500 for native 1MGAMING events';