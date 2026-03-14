
-- Add automation fields to prediction_events (all nullable with safe defaults)
ALTER TABLE public.prediction_events
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS automation_status text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS requires_admin_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS automation_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_lock_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS scheduled_live_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS result_detected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS result_source_payload jsonb,
  ADD COLUMN IF NOT EXISTS result_confidence real,
  ADD COLUMN IF NOT EXISTS result_requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settle_job_id uuid REFERENCES public.automation_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_automation_check_at timestamp with time zone;

-- Index for automation polling
CREATE INDEX IF NOT EXISTS idx_prediction_events_automation
  ON public.prediction_events (automation_status, automation_paused)
  WHERE automation_status != 'manual';
