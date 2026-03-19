
-- 1) prediction_accounts: central identity mapping
CREATE TABLE public.prediction_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_evm text UNIQUE,
  wallet_solana text,
  auth_provider text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_prediction_accounts" ON public.prediction_accounts
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE POLICY "public_read_prediction_accounts" ON public.prediction_accounts
  FOR SELECT TO public USING (true);

-- 2) prediction_trade_orders: canonical trade execution lifecycle
CREATE TABLE public.prediction_trade_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.prediction_accounts(id) ON DELETE SET NULL,
  wallet text NOT NULL,
  fight_id uuid NOT NULL REFERENCES public.prediction_fights(id) ON DELETE CASCADE,
  prediction_event_id uuid REFERENCES public.prediction_events(id) ON DELETE SET NULL,
  polymarket_market_id text,
  token_id text,
  side text NOT NULL,
  order_type text NOT NULL DEFAULT 'marketable_limit',
  requested_amount_usdc numeric(18,6) NOT NULL DEFAULT 0,
  expected_price numeric(18,6),
  expected_shares numeric(18,6),
  fee_bps integer NOT NULL DEFAULT 200,
  fee_usdc numeric(18,6) NOT NULL DEFAULT 0,
  slippage_bps integer NOT NULL DEFAULT 300,
  quote_expires_at timestamptz,
  polymarket_order_id text,
  status text NOT NULL DEFAULT 'requested',
  error_code text,
  error_message text,
  filled_amount_usdc numeric(18,6) NOT NULL DEFAULT 0,
  filled_shares numeric(18,6) NOT NULL DEFAULT 0,
  avg_fill_price numeric(18,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  finalized_at timestamptz,
  reconciled_at timestamptz
);

CREATE INDEX idx_trade_orders_wallet ON public.prediction_trade_orders (wallet);
CREATE INDEX idx_trade_orders_fight_id ON public.prediction_trade_orders (fight_id);
CREATE INDEX idx_trade_orders_status ON public.prediction_trade_orders (status);
CREATE INDEX idx_trade_orders_pm_order_id ON public.prediction_trade_orders (polymarket_order_id);
CREATE INDEX idx_trade_orders_created_at ON public.prediction_trade_orders (created_at DESC);

ALTER TABLE public.prediction_trade_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_prediction_trade_orders" ON public.prediction_trade_orders
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE POLICY "public_read_prediction_trade_orders" ON public.prediction_trade_orders
  FOR SELECT TO public USING (true);

-- 3) prediction_system_controls: runtime safety controls
CREATE TABLE public.prediction_system_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  predictions_enabled boolean NOT NULL DEFAULT true,
  new_orders_enabled boolean NOT NULL DEFAULT true,
  max_order_usdc numeric(18,6) NOT NULL DEFAULT 250,
  max_daily_user_usdc numeric(18,6) NOT NULL DEFAULT 1000,
  default_fee_bps integer NOT NULL DEFAULT 200,
  max_slippage_bps integer NOT NULL DEFAULT 300,
  allowed_market_mode text NOT NULL DEFAULT 'allowlist',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_system_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_prediction_system_controls" ON public.prediction_system_controls
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE POLICY "public_read_prediction_system_controls" ON public.prediction_system_controls
  FOR SELECT TO public USING (true);

-- Seed default row
INSERT INTO public.prediction_system_controls (
  predictions_enabled, new_orders_enabled, max_order_usdc, max_daily_user_usdc,
  default_fee_bps, max_slippage_bps, allowed_market_mode
) VALUES (true, true, 250, 1000, 200, 300, 'allowlist');

-- 4) prediction_trade_audit_log: append-only operational logging
CREATE TABLE public.prediction_trade_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_order_id uuid REFERENCES public.prediction_trade_orders(id) ON DELETE SET NULL,
  wallet text,
  action text NOT NULL,
  request_payload_json jsonb,
  response_payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trade_audit_order_id ON public.prediction_trade_audit_log (trade_order_id);
CREATE INDEX idx_trade_audit_wallet ON public.prediction_trade_audit_log (wallet);
CREATE INDEX idx_trade_audit_created_at ON public.prediction_trade_audit_log (created_at DESC);

ALTER TABLE public.prediction_trade_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_client_access_trade_audit" ON public.prediction_trade_audit_log
  FOR ALL TO public USING (false) WITH CHECK (false);
