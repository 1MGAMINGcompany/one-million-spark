ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS agreement_version text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz DEFAULT NULL;