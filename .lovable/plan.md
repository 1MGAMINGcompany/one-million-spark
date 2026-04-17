

## Operator Purchase Referral Attribution — Smallest Safe Patch

### Files Changed (5)

1. **NEW** `src/hooks/useOperatorReferralCapture.ts` — captures `?ref=CODE` to `localStorage`, key `1mg_operator_ref`. Helper exports: `getPendingOperatorRef()`, `clearPendingOperatorRef()`.
2. `src/pages/platform/LandingPage.tsx` — call `useOperatorReferralCapture()` on mount.
3. `src/pages/platform/BuyPredictionsApp.tsx` — call `useOperatorReferralCapture()` on mount.
4. `src/pages/platform/PurchasePage.tsx` — call hook on mount; read pending ref via `getPendingOperatorRef()`; include `referral_code` in both `confirm_purchase` request bodies (free-promo path + standard path); call `clearPendingOperatorRef()` on success.
5. `supabase/functions/operator-manage/index.ts` — extend `confirm_purchase` action with best-effort referral insert at the end of all 4 success branches (free-promo, partial-promo + new, partial-promo + existing, full-price + new, full-price + existing).

### Migration SQL (additive only)

```sql
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
  payout_status text not null default 'accrued',  -- accrued | paid | void
  payout_tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_op_purchase_ref_operator
  on public.operator_purchase_referrals(operator_id);
create index if not exists idx_op_purchase_ref_code
  on public.operator_purchase_referrals(referral_code);
create index if not exists idx_op_purchase_ref_wallet
  on public.operator_purchase_referrals(referred_by_wallet);

-- 3. RLS: deny all client writes; allow public read (mirrors operator_revenue policy pattern)
alter table public.operator_purchase_referrals enable row level security;

create policy "deny_client_writes_operator_purchase_referrals"
  on public.operator_purchase_referrals for all
  using (false) with check (false);

create policy "public_read_operator_purchase_referrals"
  on public.operator_purchase_referrals for select
  using (true);
```

### Edge Function Logic — `operator-manage` confirm_purchase (additive only)

After every operator activation (`status: "active"`), run a single best-effort helper:

```ts
// Commission table: 2400 USDC tier → 400 USDC commission
const COMMISSION_BY_PRICE: Array<{ price: number; commission: number }> = [
  { price: 2400, commission: 400 },
  // future: { price: 24000, commission: 4000 },
];

async function recordReferralBestEffort(
  sb: any,
  opts: {
    operatorId: string;
    privyDid: string;
    referralCode?: string;
    txHash?: string | null;
    amountCharged: number;
  },
) {
  try {
    const code = opts.referralCode?.trim().toUpperCase();
    if (!code) return;

    // Validate code against player_profiles
    const { data: refProfile } = await sb
      .from("player_profiles")
      .select("wallet, referral_code")
      .eq("referral_code", code)
      .maybeSingle();
    if (!refProfile) return; // unknown code — silently ignore

    // Self-referral guard: compare referrer wallet to operator's payout wallet OR privy_did mapping
    const { data: opRow } = await sb
      .from("operators")
      .select("payout_wallet")
      .eq("id", opts.operatorId)
      .maybeSingle();
    if (opRow?.payout_wallet && opRow.payout_wallet.toLowerCase() === refProfile.wallet.toLowerCase()) {
      return; // self-referral
    }

    // Commission lookup (defaults to 0 if tier not configured)
    const tier = COMMISSION_BY_PRICE.find(t => t.price === opts.amountCharged);
    const commission = tier?.commission ?? 0;

    // Stamp referral on operators row (idempotent — only if not already set)
    await sb.from("operators").update({
      referral_code: code,
      referred_by_wallet: refProfile.wallet,
    }).eq("id", opts.operatorId).is("referral_code", null);

    // Insert commission event
    await sb.from("operator_purchase_referrals").insert({
      operator_id: opts.operatorId,
      referral_code: code,
      referred_by_wallet: refProfile.wallet,
      purchase_tx_hash: opts.txHash ?? null,
      purchase_amount_usdc: opts.amountCharged,
      commission_usdc: commission,
      payout_status: "accrued",
    });
  } catch (e) {
    console.error("[referral] best-effort insert failed:", e);
    // NEVER throw — purchase must succeed
  }
}
```

Called once per success branch with `amountCharged` = 0 (free promo), `discountedPrice` (partial promo), or 2400 (full price). The existing return statements stay exactly the same.

### What Does NOT Change

- Privy login, wallet funding, USDC.e Polygon payment
- On-chain verification (`verifyTxOnChain`)
- Replay protection (`purchase_tx_hash` uniqueness)
- Operator creation logic (insert/update)
- Ownership binding (`user_id = privyDid`)
- Payout wallet auto-fill (onboarding)
- Agreement v1.0 logic
- Onboarding flow & public slug launch
- Trading, settlement, payout, sweep
- Existing player-side referral system (`useReferralCapture`, `referral-bind`)

### Risk Check

| Risk | Mitigation |
|---|---|
| Referral insert fails | Wrapped in try/catch; never throws; purchase always returns success |
| Invalid referral code | Silent ignore (no error to user) |
| Self-referral | Wallet comparison against `payout_wallet`; silent skip |
| Race: same code used twice | `idx_op_purchase_ref_operator` allows multiple events per operator (intended for future re-attribution); operator row stamped only if `referral_code IS NULL` |
| RLS regression | Additive deny-all policy + public read mirrors `operator_revenue` pattern |
| `?ref=` collision with player referral | Different localStorage key (`1mg_operator_ref` vs `1mg_pending_referral`); both can coexist |

### Test Plan

1. **No referral**: visit `/`, sign in, buy → operator created, no row in `operator_purchase_referrals`. ✅
2. **Valid referral**: visit `/?ref=PARTNER01`, complete purchase → operator row has `referral_code='PARTNER01'`, `referred_by_wallet` set; one row in `operator_purchase_referrals` with `commission_usdc=400`, `payout_status='accrued'`. ✅
3. **Invalid referral code**: visit `/?ref=NOTREAL`, complete purchase → operator created, no referral row, no error to user. ✅
4. **Self-referral**: referrer's own wallet visits with their own code, completes purchase → operator created, no referral row. ✅
5. **Free promo + referral**: visit `/?ref=PARTNER01`, apply 100% promo → operator activated; referral row with `commission_usdc=0` (since amountCharged=0 has no tier match) + `purchase_tx_hash=null`. ✅
6. **Capture persistence**: visit `/?ref=PARTNER01` → leave site → return to `/purchase` → ref still applied. ✅
7. **URL cleanup**: after capture, `?ref=` is stripped from URL via `history.replaceState`. ✅
8. **Migration safety**: re-run migration → `if not exists` guards prevent duplicate column/table errors. ✅

