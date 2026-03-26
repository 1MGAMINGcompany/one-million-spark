CREATE TABLE public.geo_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  wallet text,
  detected_region text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.geo_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_join_waitlist" ON public.geo_waitlist FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "no_client_reads_geo_waitlist" ON public.geo_waitlist FOR SELECT TO public USING (false);