
-- ═══════════════════════════════════════════════════════════
-- polymarket_user_sessions: Stores user-linked Polymarket credentials
-- Credentials are derived server-side from wallet signature
-- NEVER exposed to frontend
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.polymarket_user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  -- Polymarket CLOB API credentials (derived from user's wallet signature)
  pm_api_key text,
  pm_api_secret text,
  pm_passphrase text,
  -- Derived signing key for EIP-712 order signing (NOT the user's main wallet key)
  pm_derived_address text,
  -- Session state
  status text NOT NULL DEFAULT 'pending',
  -- CTF allowance status on Polygon
  ctf_allowance_set boolean NOT NULL DEFAULT false,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  authenticated_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One active session per wallet
  UNIQUE(wallet)
);

-- RLS: No client access (secrets table, server-side only)
ALTER TABLE public.polymarket_user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_client_access_pm_sessions"
  ON public.polymarket_user_sessions
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.polymarket_user_sessions IS 'Server-side only. Stores user-linked Polymarket API credentials derived from wallet signatures. Never exposed to frontend.';

-- ═══════════════════════════════════════════════════════════
-- polymarket_user_positions: Cached user positions from Polymarket
-- Synced from Polymarket Data API, displayed in frontend
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.polymarket_user_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  fight_id uuid REFERENCES public.prediction_fights(id) ON DELETE CASCADE,
  -- Polymarket position data
  condition_id text NOT NULL,
  outcome_index integer NOT NULL DEFAULT 0,
  token_id text,
  size numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  realized_pnl numeric NOT NULL DEFAULT 0,
  -- Sync metadata
  pm_order_id text,
  pm_order_status text DEFAULT 'pending',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.polymarket_user_positions ENABLE ROW LEVEL SECURITY;

-- Public read for position display
CREATE POLICY "public_read_pm_positions"
  ON public.polymarket_user_positions
  FOR SELECT TO public
  USING (true);

-- No client writes
CREATE POLICY "deny_client_writes_pm_positions"
  ON public.polymarket_user_positions
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

CREATE INDEX idx_pm_positions_wallet ON public.polymarket_user_positions(wallet);
CREATE INDEX idx_pm_positions_fight ON public.polymarket_user_positions(fight_id);
