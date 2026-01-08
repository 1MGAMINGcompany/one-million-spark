-- Step 1: Create settlement_logs table for comprehensive payout debugging
-- This captures BOTH successful and failed settlement attempts

CREATE TABLE IF NOT EXISTS public.settlement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_pda text NOT NULL,
  action text NOT NULL DEFAULT 'forfeit',
  success boolean NOT NULL DEFAULT false,
  signature text,
  winner_wallet text,
  forfeiting_wallet text,
  error_message text,
  vault_pda text,
  vault_lamports bigint,
  verifier_pubkey text,
  verifier_lamports bigint,
  stake_per_player bigint,
  player_count integer,
  expected_pot bigint,
  room_status integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.settlement_logs ENABLE ROW LEVEL SECURITY;

-- Public read access for debugging
CREATE POLICY "public read settlement_logs" 
ON public.settlement_logs FOR SELECT USING (true);

-- Index for quick room lookups
CREATE INDEX idx_settlement_logs_room ON public.settlement_logs(room_pda);
CREATE INDEX idx_settlement_logs_created ON public.settlement_logs(created_at DESC);

-- Enable realtime for debugging
ALTER PUBLICATION supabase_realtime ADD TABLE public.settlement_logs;