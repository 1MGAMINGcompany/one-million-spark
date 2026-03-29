
CREATE TABLE IF NOT EXISTS public.operator_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL,
  amount_usdc numeric(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_operator_payouts" ON public.operator_payouts FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "public_read_operator_payouts" ON public.operator_payouts FOR SELECT TO public USING (true);
