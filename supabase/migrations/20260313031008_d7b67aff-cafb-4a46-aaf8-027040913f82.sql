
-- 1. Create prediction_events parent table
CREATE TABLE public.prediction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  organization text,
  event_date timestamptz,
  location text,
  source text NOT NULL DEFAULT 'manual',
  source_url text,
  status text NOT NULL DEFAULT 'draft',
  auto_resolve boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  review_required boolean NOT NULL DEFAULT false,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for prediction_events
ALTER TABLE public.prediction_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_prediction_events"
  ON public.prediction_events
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "deny_client_writes_prediction_events"
  ON public.prediction_events
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- 2. Alter prediction_fights with new columns
ALTER TABLE public.prediction_fights
  ADD COLUMN event_id uuid REFERENCES public.prediction_events(id),
  ADD COLUMN weight_class text,
  ADD COLUMN fight_class text,
  ADD COLUMN method text,
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN settled_at timestamptz,
  ADD COLUMN refund_status text,
  ADD COLUMN refunds_started_at timestamptz,
  ADD COLUMN refunds_completed_at timestamptz,
  ADD COLUMN review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN review_reason text,
  ADD COLUMN auto_resolve boolean NOT NULL DEFAULT false,
  ADD COLUMN source text NOT NULL DEFAULT 'manual';

-- 3. Updated_at trigger for prediction_events
CREATE TRIGGER update_prediction_events_updated_at
  BEFORE UPDATE ON public.prediction_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
