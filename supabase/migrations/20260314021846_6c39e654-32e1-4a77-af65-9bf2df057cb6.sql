
-- Single-row settings table for prediction kill switches
CREATE TABLE public.prediction_settings (
  id text PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  predictions_enabled boolean NOT NULL DEFAULT true,
  claims_enabled boolean NOT NULL DEFAULT true,
  automation_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert the default row
INSERT INTO public.prediction_settings (id) VALUES ('global');

-- RLS: public read, no client writes
ALTER TABLE public.prediction_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_prediction_settings"
  ON public.prediction_settings
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "deny_client_writes_prediction_settings"
  ON public.prediction_settings
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
