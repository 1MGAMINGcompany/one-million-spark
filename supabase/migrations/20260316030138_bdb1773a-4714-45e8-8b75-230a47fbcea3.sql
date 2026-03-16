
-- Step 1a: Add referral_percentage to player_profiles with default 20
ALTER TABLE public.player_profiles
ADD COLUMN IF NOT EXISTS referral_percentage INTEGER NOT NULL DEFAULT 20;

-- Step 1b: Create referral_payout_logs table
CREATE TABLE IF NOT EXISTS public.referral_payout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_wallet TEXT NOT NULL,
  referral_code TEXT,
  amount_sol NUMERIC NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by_admin_wallet TEXT NOT NULL,
  note TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 1c: Create validation trigger for referral_percentage
CREATE OR REPLACE FUNCTION public.validate_referral_percentage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.referral_percentage IS NOT NULL AND NEW.referral_percentage NOT IN (5,10,15,20,25,30,35,40,45,50) THEN
    RAISE EXCEPTION 'referral_percentage must be one of: 5,10,15,20,25,30,35,40,45,50';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_referral_percentage ON public.player_profiles;
CREATE TRIGGER trg_validate_referral_percentage
  BEFORE INSERT OR UPDATE ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_referral_percentage();

-- Step 1d: Create validation trigger for amount_sol > 0
CREATE OR REPLACE FUNCTION public.validate_payout_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.amount_sol <= 0 THEN
    RAISE EXCEPTION 'amount_sol must be greater than 0';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payout_amount ON public.referral_payout_logs;
CREATE TRIGGER trg_validate_payout_amount
  BEFORE INSERT ON public.referral_payout_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payout_amount();

-- Step 1e: RLS on referral_payout_logs
ALTER TABLE public.referral_payout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_referral_payout_logs"
ON public.referral_payout_logs
FOR SELECT
TO public
USING (true);

CREATE POLICY "deny_client_writes_referral_payout_logs"
ON public.referral_payout_logs
FOR ALL
TO public
USING (false)
WITH CHECK (false);
