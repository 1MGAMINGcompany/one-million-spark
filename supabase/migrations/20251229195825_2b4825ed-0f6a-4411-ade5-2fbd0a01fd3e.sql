-- Create recovery_logs table to track recovery attempts
CREATE TABLE public.recovery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_pda TEXT NOT NULL,
  caller_wallet TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  tx_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.recovery_logs ENABLE ROW LEVEL SECURITY;

-- Public read access for transparency
CREATE POLICY "public read recovery_logs"
ON public.recovery_logs
FOR SELECT
USING (true);

-- Create index for efficient lookups
CREATE INDEX idx_recovery_logs_room_pda ON public.recovery_logs(room_pda);
CREATE INDEX idx_recovery_logs_caller_wallet ON public.recovery_logs(caller_wallet);