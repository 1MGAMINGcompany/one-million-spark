
-- Add payout wallet to operators table
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS payout_wallet text;

-- Add sweep lifecycle columns to operator_revenue
ALTER TABLE public.operator_revenue
  ADD COLUMN IF NOT EXISTS sweep_status text NOT NULL DEFAULT 'accrued',
  ADD COLUMN IF NOT EXISTS sweep_tx_hash text,
  ADD COLUMN IF NOT EXISTS sweep_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS sweep_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sweep_error text,
  ADD COLUMN IF NOT EXISTS sweep_destination_wallet text;

-- Index for efficient sweep queries (find rows needing sweep)
CREATE INDEX IF NOT EXISTS idx_operator_revenue_sweep_status
  ON public.operator_revenue (sweep_status)
  WHERE sweep_status IN ('accrued', 'failed');

-- Unique index on sweep_tx_hash to prevent double-recording
CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_revenue_sweep_tx_hash
  ON public.operator_revenue (sweep_tx_hash)
  WHERE sweep_tx_hash IS NOT NULL;
