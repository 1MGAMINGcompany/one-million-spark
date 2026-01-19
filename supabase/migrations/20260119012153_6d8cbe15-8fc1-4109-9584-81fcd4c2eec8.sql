-- Create client_errors table for crash telemetry
CREATE TABLE public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  route text,
  wallet_browser text,
  user_agent text,
  error_stack text,
  error_message text,
  debug_events jsonb,
  build_version text,
  wallet_address text
);

-- Enable RLS but allow anonymous inserts (error reporting should always work)
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert errors (critical for crash reporting)
CREATE POLICY "Allow anonymous inserts" ON public.client_errors
  FOR INSERT WITH CHECK (true);

-- No reads allowed from client (admin-only via dashboard)
CREATE POLICY "No client reads" ON public.client_errors
  FOR SELECT USING (false);