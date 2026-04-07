
Root cause

- The `Collect Winnings` UI already exists in `src/components/operator/SimplePredictionCard.tsx`, but it only appears when a winning resolved pick has `claimed = false`.
- Your Lightning vs. Sabres record is still corrupted in the database:
  - entry `3b12bf1f-b163-4e58-b873-235fdc80a7ed`
  - `claimed = true`
  - `reward_usd = 98`
  - `polymarket_status = redemption_pending`
- The underlying trade was never actually executed on Polymarket:
  - trade order `09db4fe5-3652-4111-bf09-544de4eceead`
  - `filled_amount_usdc = 0.98`
  - `filled_shares = 98`
  - `polymarket_order_id = null`
- So the app hides `Collect Winnings` because it thinks the pick was already claimed.
- The balance also never dropped by $1 because `prediction-submit` currently has a fake fallback for Polymarket fights: it collects the fee, then marks the trade as filled without funding/submitting a real Polymarket order.

Plan

1. Remove fake Polymarket fills
- File: `supabase/functions/prediction-submit/index.ts`
- Remove the local/native fallback for Polymarket-backed fights.
- For Polymarket fights, only create a real filled pick if:
  - the trading session exists,
  - the trading wallet is funded,
  - a real `polymarket_order_id` is created or confirmed.
- If that fails, return a clear error and do not insert a normal pick that looks claimable.

2. Repair corrupted existing rows
- Add a one-time backend repair for Polymarket-backed entries that were marked claimed or filled without a real `polymarket_order_id`.
- Reset the bad Lightning vs. Sabres row and similar rows so they stop pretending the user already claimed winnings.
- Reclassify them as `not_executed` / failed-market-execution instead of valid wins.

3. Make My Picks show the real execution state
- Files:
  - `src/pages/platform/OperatorApp.tsx`
  - `src/components/operator/SimplePredictionCard.tsx`
- Extend the card state to use execution fields like:
  - `polymarket_order_id`
  - `polymarket_status`
- UI states should be:
  - real settled winner + unclaimed → `Collect Winnings`
  - real claimed winner → collected state
  - no real order ID → `Order not executed` / `Trade never reached market`
- This prevents fake “You won” records from looking redeemable.

4. Stop claim functions from writing fake payouts
- Files:
  - `supabase/functions/prediction-claim/index.ts`
  - `supabase/functions/prediction-auto-claim/index.ts`
- For Polymarket-backed fights with no real `polymarket_order_id`, do not mark entries as claimed and do not write `reward_usd`.
- Remove the current local payout path for Polymarket fights, since this product is supposed to work directly with Polymarket, not a local pool/treasury model.

5. Improve the share card logo treatment
- File: `src/components/SocialShareModal.tsx`
- Keep the larger logo area, but replace the current `object-contain` treatment with a larger framed/cropped presentation so wide logos appear more zoomed and legible on mobile.

Technical details

- The fight itself is already correct:
  - `prediction_fights.id = 6d92de80-68ee-48c0-b4cf-a97ed0e57732`
  - `status = settled`
  - `winner = fighter_b`
- The blocker is no longer result detection.
- The actual bug chain is:

```text
prediction-submit
  -> fee may be collected
  -> no real Polymarket order exists
  -> entry still gets inserted like a real pick

prediction-claim
  -> corrupted row is already claimed=true
  -> Collect Winnings button is hidden
  -> fake $98 reward remains in the database
```

Expected outcome

- Your current bad row will be repaired so the app stops showing a false claimed win.
- For this exact pick, if there was no real Polymarket order, the app should not pretend there are winnings to collect.
- Future picks will only appear as claimable if they actually executed on Polymarket.
- Real executed winning picks will show `Collect Winnings` correctly.
- Balance changes will finally match actual executed trades.
- The share image logo will look noticeably larger and clearer.
