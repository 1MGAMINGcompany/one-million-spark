ALTER TABLE public.polymarket_user_sessions 
ADD COLUMN IF NOT EXISTS safe_address text,
ADD COLUMN IF NOT EXISTS privy_wallet_id text,
ADD COLUMN IF NOT EXISTS safe_deployed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS approvals_set boolean NOT NULL DEFAULT false;