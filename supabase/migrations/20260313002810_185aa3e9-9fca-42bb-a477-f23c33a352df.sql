
-- Table: prediction_fights
CREATE TABLE public.prediction_fights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  fighter_a_name text NOT NULL,
  fighter_b_name text NOT NULL,
  pool_a_lamports bigint NOT NULL DEFAULT 0,
  pool_b_lamports bigint NOT NULL DEFAULT 0,
  shares_a bigint NOT NULL DEFAULT 0,
  shares_b bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  winner text,
  resolved_at timestamptz,
  claims_open_at timestamptz,
  event_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_fights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_prediction_fights" ON public.prediction_fights
  FOR SELECT TO public USING (true);

CREATE POLICY "deny_client_writes_prediction_fights" ON public.prediction_fights
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Auto-update updated_at
CREATE TRIGGER update_prediction_fights_updated_at
  BEFORE UPDATE ON public.prediction_fights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.prediction_fights;

-- Table: prediction_entries
CREATE TABLE public.prediction_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fight_id uuid NOT NULL REFERENCES public.prediction_fights(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  fighter_pick text NOT NULL,
  amount_lamports bigint NOT NULL,
  fee_lamports bigint NOT NULL,
  pool_lamports bigint NOT NULL,
  shares bigint NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  reward_lamports bigint,
  tx_signature text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_prediction_entries" ON public.prediction_entries
  FOR SELECT TO public USING (true);

CREATE POLICY "deny_client_writes_prediction_entries" ON public.prediction_entries
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Enable realtime for live feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.prediction_entries;

-- Table: prediction_admins
CREATE TABLE public.prediction_admins (
  wallet text PRIMARY KEY
);

ALTER TABLE public.prediction_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_prediction_admins" ON public.prediction_admins
  FOR SELECT TO public USING (true);
