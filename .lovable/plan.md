

# Fix Operator Purchase Verification: Dynamic Amounts + Replay Protection

## Problem
1. `verifyTxOnChain` hardcodes `MIN_AMOUNT_RAW = 2400 USDC`. Partial promo discounts fail verification because the on-chain transfer is less than $2,400.
2. No replay protection — the same `tx_hash` could activate multiple operator accounts.
3. The `operators` table has no column to store the purchase transaction hash.

## Changes

### 1. Database Migration
Add `purchase_tx_hash` column to `operators` table with a unique constraint:

```sql
ALTER TABLE operators ADD COLUMN purchase_tx_hash text;
CREATE UNIQUE INDEX idx_operators_purchase_tx_hash ON operators (purchase_tx_hash) WHERE purchase_tx_hash IS NOT NULL;
```

### 2. Edge Function: `supabase/functions/operator-manage/index.ts`

**a) Make `verifyTxOnChain` accept a `minAmountRaw` parameter:**
```typescript
async function verifyTxOnChain(txHash: string, minAmountRaw: bigint): Promise<...>
```
Replace the hardcoded `MIN_AMOUNT_RAW` reference inside with the parameter. Remove the top-level `MIN_AMOUNT_RAW` constant.

**b) Partial discount path (lines 112-114):** Pass the discounted amount:
```typescript
const minRaw = BigInt(Math.round(discountedPrice)) * BigInt(10 ** 6);
const verification = await verifyTxOnChain(txHash, minRaw);
```

**c) Full-price path (lines 126-128):** Pass the full $2,400:
```typescript
const verification = await verifyTxOnChain(txHash, BigInt(2400) * BigInt(10 ** 6));
```

**d) Replay protection:** Before verification, check uniqueness:
```typescript
const { data: replay } = await sb.from("operators")
  .select("id").eq("purchase_tx_hash", txHash).maybeSingle();
if (replay) return jsonResp({ error: "tx_already_used" }, 409);
```

**e) Store tx_hash on activation:** In all insert/update calls within `confirm_purchase`, include `purchase_tx_hash: txHash`.

## What Does NOT Change
- Frontend (`PurchasePage.tsx`) — already sends the correct discounted amount
- Promo code validation logic — unchanged
- All other actions (`create_operator`, `settle_event`, etc.) — untouched
- Gas sponsorship is handled by Privy dashboard config — no code changes needed

