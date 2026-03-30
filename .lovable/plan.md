

## Plan: Change Platform Fee from 1% to 1.5% (Backend + Frontend)

### Summary
Update the platform fee from 1% (100 bps) to 1.5% (150 bps) across all backend fee logic and frontend UI text. Also update the default Polymarket fee from 2% to 2.25% (since 1.5% platform + 0.75% exchange = 2.25%).

### Changes

#### 1. Backend: Update fee constants
**File:** `supabase/functions/prediction-submit/index.ts`

- **Line 878**: Change default Polymarket fee from `200` (2%) to `225` (2.25%) — this is 1.5% platform + 0.75% exchange
- **Line 1476**: Change `platformFeeBps = 100` to `platformFeeBps = 150` (operator revenue split)

#### 2. Frontend: Update PredictionModal fee defaults
**File:** `src/components/predictions/PredictionModal.tsx`

- **Line 21**: Change `0.02` → `0.0225` (Polymarket default)
- **Line 25**: Change `200` → `225` (Polymarket default bps)

#### 3. Frontend: Update SoccerMatchCard fee defaults
**File:** `src/components/predictions/SoccerMatchCard.tsx`

- **Line 50**: Change `0.02` → `0.0225`
- **Line 119**: Change default `0.02` → `0.0225`

#### 4. Frontend: Update TradeTicket fee label
**File:** `src/components/predictions/TradeTicket.tsx`

- Update the "Exchange Fee (~0.75%)" line text and "Platform Fee" display to show the 1.5% correctly

#### 5. Purchase/Onboarding pages: Update 1% → 1.5% text
**Files:**
- `src/pages/platform/PurchasePage.tsx` — Lines 228-231, 277: Change "1%" to "1.5%"
- `src/pages/platform/OperatorOnboarding.tsx` — Line 198: Change "1%" to "1.5%"

### Files Changed
1. `supabase/functions/prediction-submit/index.ts` — fee constants (200→225 bps default, 100→150 bps platform split)
2. `src/components/predictions/PredictionModal.tsx` — fee rate defaults
3. `src/components/predictions/SoccerMatchCard.tsx` — fee rate defaults
4. `src/components/predictions/TradeTicket.tsx` — fee label text
5. `src/pages/platform/PurchasePage.tsx` — UI text 1% → 1.5%
6. `src/pages/platform/OperatorOnboarding.tsx` — UI text 1% → 1.5%

