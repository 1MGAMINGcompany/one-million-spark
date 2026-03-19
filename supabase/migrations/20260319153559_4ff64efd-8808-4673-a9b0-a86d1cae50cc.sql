
-- ══════════════════════════════════════════════════════════════
-- Polymarket mapping columns for prediction system
-- ══════════════════════════════════════════════════════════════

-- prediction_events: Polymarket event mapping
ALTER TABLE public.prediction_events
  ADD COLUMN IF NOT EXISTS polymarket_event_id text,
  ADD COLUMN IF NOT EXISTS polymarket_slug text;

-- prediction_fights: Polymarket market/token mapping
ALTER TABLE public.prediction_fights
  ADD COLUMN IF NOT EXISTS polymarket_market_id text,
  ADD COLUMN IF NOT EXISTS polymarket_condition_id text,
  ADD COLUMN IF NOT EXISTS polymarket_slug text,
  ADD COLUMN IF NOT EXISTS polymarket_outcome_a_token text,
  ADD COLUMN IF NOT EXISTS polymarket_outcome_b_token text,
  ADD COLUMN IF NOT EXISTS polymarket_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS polymarket_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS polymarket_question text,
  ADD COLUMN IF NOT EXISTS price_a numeric(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_b numeric(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS polymarket_last_synced_at timestamptz;

-- prediction_entries: Polymarket order tracking
ALTER TABLE public.prediction_entries
  ADD COLUMN IF NOT EXISTS polymarket_order_id text,
  ADD COLUMN IF NOT EXISTS polymarket_status text DEFAULT 'pending';

-- Create a table for Polymarket market sync state
CREATE TABLE IF NOT EXISTS public.polymarket_sync_state (
  id text PRIMARY KEY DEFAULT 'global',
  last_synced_at timestamptz DEFAULT now(),
  last_cursor text,
  markets_synced integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.polymarket_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_all_polymarket_sync"
  ON public.polymarket_sync_state
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Partial unique index to prevent duplicate Polymarket imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_fights_polymarket_market_id
  ON public.prediction_fights (polymarket_market_id)
  WHERE polymarket_market_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_events_polymarket_event_id
  ON public.prediction_events (polymarket_event_id)
  WHERE polymarket_event_id IS NOT NULL;
