
-- Create page_visits table for navigation tracking
CREATE TABLE public.page_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  page text NOT NULL,
  game text,
  entered_at timestamptz NOT NULL DEFAULT now()
);

-- Index for stats queries
CREATE INDEX idx_page_visits_entered_at ON public.page_visits (entered_at DESC);
CREATE INDEX idx_page_visits_session_id ON public.page_visits (session_id);

-- Enable RLS and deny all client access (service role only)
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_clients" ON public.page_visits
  AS RESTRICTIVE FOR ALL
  USING (false)
  WITH CHECK (false);
