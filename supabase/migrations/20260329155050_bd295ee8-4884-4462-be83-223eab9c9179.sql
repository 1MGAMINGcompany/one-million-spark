
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'full',
  discount_value numeric(18,6) NOT NULL DEFAULT 0,
  max_uses integer NOT NULL DEFAULT 1,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by text
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_promo_codes" ON public.promo_codes FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "public_read_promo_codes" ON public.promo_codes FOR SELECT TO public USING (true);
