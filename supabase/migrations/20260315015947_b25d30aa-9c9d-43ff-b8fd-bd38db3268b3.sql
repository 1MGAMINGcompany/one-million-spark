
-- Add referral columns to player_profiles
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_code text,
  ADD COLUMN IF NOT EXISTS referred_by_wallet text,
  ADD COLUMN IF NOT EXISTS referral_created_at timestamptz;

-- Auto-generate referral codes for existing profiles
UPDATE public.player_profiles
SET referral_code = UPPER(SUBSTR(MD5(wallet || 'ref_salt_1mg'), 1, 8))
WHERE referral_code IS NULL;

-- Create referral_rewards table
CREATE TABLE public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_wallet text NOT NULL,
  player_wallet text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('prediction', 'skill_game')),
  source_id text NOT NULL,
  wager_amount bigint NOT NULL DEFAULT 0,
  platform_fee_amount bigint NOT NULL DEFAULT 0,
  referral_reward_amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'paid', 'voided')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  notes text
);

-- Create referral_abuse_logs table for audit trail
CREATE TABLE public.referral_abuse_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  attempted_code text,
  reason text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for referral_rewards: public read, no client writes
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_referral_rewards" ON public.referral_rewards FOR SELECT TO public USING (true);
CREATE POLICY "deny_client_writes_referral_rewards" ON public.referral_rewards FOR ALL TO public USING (false) WITH CHECK (false);

-- RLS for referral_abuse_logs: no client access
ALTER TABLE public.referral_abuse_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_client_referral_abuse_logs" ON public.referral_abuse_logs FOR ALL TO public USING (false) WITH CHECK (false);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON public.referral_rewards (referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_player ON public.referral_rewards (player_wallet);
CREATE INDEX IF NOT EXISTS idx_player_profiles_referral_code ON public.player_profiles (referral_code);
CREATE INDEX IF NOT EXISTS idx_player_profiles_referred_by ON public.player_profiles (referred_by_wallet);
