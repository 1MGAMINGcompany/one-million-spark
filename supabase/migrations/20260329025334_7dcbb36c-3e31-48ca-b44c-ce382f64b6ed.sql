
-- Add source_operator_id to prediction_trade_orders
ALTER TABLE public.prediction_trade_orders
  ADD COLUMN IF NOT EXISTS source_operator_id uuid DEFAULT NULL;

-- Add source_operator_id to prediction_entries
ALTER TABLE public.prediction_entries
  ADD COLUMN IF NOT EXISTS source_operator_id uuid DEFAULT NULL;

-- Add operator_event_id to prediction_fights (links operator event to fight)
ALTER TABLE public.prediction_fights
  ADD COLUMN IF NOT EXISTS operator_event_id uuid DEFAULT NULL;

-- Add operator_id to prediction_fights (which operator owns this fight)
ALTER TABLE public.prediction_fights
  ADD COLUMN IF NOT EXISTS operator_id uuid DEFAULT NULL;

-- Create operator_revenue table
CREATE TABLE IF NOT EXISTS public.operator_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL,
  fight_id uuid NOT NULL,
  entry_id uuid,
  trade_order_id uuid,
  platform_fee_usdc numeric(18,6) NOT NULL DEFAULT 0,
  operator_fee_usdc numeric(18,6) NOT NULL DEFAULT 0,
  total_fee_usdc numeric(18,6) NOT NULL DEFAULT 0,
  entry_amount_usdc numeric(18,6) NOT NULL DEFAULT 0,
  payout_status text NOT NULL DEFAULT 'accrued',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_operator_revenue"
  ON public.operator_revenue FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "public_read_operator_revenue"
  ON public.operator_revenue FOR SELECT TO public
  USING (true);
