-- 1. Operators table: nullable additive columns
alter table public.operators
  add column if not exists referral_code text,
  add column if not exists referred_by_wallet text;

-- 2. New commission events table
create table if not exists public.operator_purchase_referrals (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  referral_code text not null,
  referred_by_wallet text,
  purchase_tx_hash text,
  purchase_amount_usdc numeric not null default 0,
  commission_usdc numeric not null default 0,
  payout_status text not null default 'accrued',
  payout_tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_op_purchase_ref_operator
  on public.operator_purchase_referrals(operator_id);
create index if not exists idx_op_purchase_ref_code
  on public.operator_purchase_referrals(referral_code);
create index if not exists idx_op_purchase_ref_wallet
  on public.operator_purchase_referrals(referred_by_wallet);

-- 3. RLS
alter table public.operator_purchase_referrals enable row level security;

create policy "deny_client_writes_operator_purchase_referrals"
  on public.operator_purchase_referrals for all
  using (false) with check (false);

create policy "public_read_operator_purchase_referrals"
  on public.operator_purchase_referrals for select
  using (true);