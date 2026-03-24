
-- Operators table
CREATE TABLE public.operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  brand_name text NOT NULL,
  subdomain text UNIQUE NOT NULL,
  logo_url text,
  theme text NOT NULL DEFAULT 'blue',
  fee_percent numeric NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_operators" ON public.operators FOR SELECT TO public USING (true);
CREATE POLICY "deny_client_writes_operators" ON public.operators FOR ALL TO public USING (false) WITH CHECK (false);

-- Operator settings table
CREATE TABLE public.operator_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.operators(id) ON DELETE CASCADE NOT NULL UNIQUE,
  allowed_sports text[] DEFAULT '{}',
  show_polymarket_events boolean DEFAULT true,
  show_platform_events boolean DEFAULT true,
  homepage_layout text DEFAULT 'default',
  featured_event_ids uuid[] DEFAULT '{}'
);
ALTER TABLE public.operator_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_operator_settings" ON public.operator_settings FOR SELECT TO public USING (true);
CREATE POLICY "deny_client_writes_operator_settings" ON public.operator_settings FOR ALL TO public USING (false) WITH CHECK (false);

-- Operator events table
CREATE TABLE public.operator_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.operators(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  sport text,
  team_a text NOT NULL,
  team_b text NOT NULL,
  event_date timestamptz,
  image_url text,
  is_featured boolean DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operator_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_operator_events" ON public.operator_events FOR SELECT TO public USING (true);
CREATE POLICY "deny_client_writes_operator_events" ON public.operator_events FOR ALL TO public USING (false) WITH CHECK (false);
