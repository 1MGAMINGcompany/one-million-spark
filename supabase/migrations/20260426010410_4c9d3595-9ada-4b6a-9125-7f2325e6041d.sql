-- Soft-delete columns for admin moderation
ALTER TABLE public.operators ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.prediction_fights ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.operator_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial indexes for active-only lookups (most common path)
CREATE INDEX IF NOT EXISTS idx_operators_active
  ON public.operators (subdomain)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_fights_active_operator
  ON public.prediction_fights (operator_id, status)
  WHERE deleted_at IS NULL AND operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operator_events_active
  ON public.operator_events (operator_id, status)
  WHERE deleted_at IS NULL;