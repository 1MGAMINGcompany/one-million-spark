
-- ══════════════════════════════════════════════════
-- automation_jobs: tracks scheduled/running automation tasks
-- ══════════════════════════════════════════════════
CREATE TABLE public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,               -- e.g. 'lock_fight', 'mark_live', 'detect_result', 'settle_event', 'scrape_event'
  target_type text NOT NULL DEFAULT 'event',  -- 'event' | 'fight'
  target_id uuid NOT NULL,              -- FK to prediction_events or prediction_fights
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled', 'skipped'
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  result_payload jsonb DEFAULT '{}'::jsonb,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_automation_jobs"
  ON public.automation_jobs FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "public_read_automation_jobs"
  ON public.automation_jobs FOR SELECT TO public
  USING (true);

-- Index for efficient job polling
CREATE INDEX idx_automation_jobs_status_scheduled
  ON public.automation_jobs (status, scheduled_at)
  WHERE status IN ('pending', 'running');

-- ══════════════════════════════════════════════════
-- automation_logs: immutable audit trail for automation actions
-- ══════════════════════════════════════════════════
CREATE TABLE public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.automation_jobs(id) ON DELETE SET NULL,
  event_id uuid,
  fight_id uuid,
  action text NOT NULL,                  -- e.g. 'event_discovered', 'fight_locked', 'result_detected', 'result_confirmed', 'admin_override'
  source text,                           -- e.g. 'tapology', 'boxrec', 'sherdog', 'manual', 'cron'
  details jsonb DEFAULT '{}'::jsonb,
  confidence real,                       -- 0.0–1.0 for result detection
  admin_wallet text,                     -- if action was admin-triggered
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_automation_logs"
  ON public.automation_logs FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "public_read_automation_logs"
  ON public.automation_logs FOR SELECT TO public
  USING (true);

-- Indexes for common lookups
CREATE INDEX idx_automation_logs_event ON public.automation_logs (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_automation_logs_fight ON public.automation_logs (fight_id) WHERE fight_id IS NOT NULL;
CREATE INDEX idx_automation_logs_job ON public.automation_logs (job_id) WHERE job_id IS NOT NULL;
