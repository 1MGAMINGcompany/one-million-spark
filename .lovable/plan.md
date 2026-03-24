

## Premium Landing Page + $2,400 USDC Purchase Flow on Polygon

### Summary

Redesign the landing page with premium visuals (floating sport icons, animated counters, gradient mesh, phone mockup) and build a proper purchase page that collects $2,400 USDC on Polygon. Before payment, clearly inform users about the 1% platform fee on every prediction and why it exists.

### Key Corrections from Your Feedback

- **Polygon USDC** — all payments use Polygon USDC (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359), not Solana
- **Treasury wallet** — 0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d (existing Polygon treasury)
- **1% platform fee** — clearly disclosed before purchase. Messaging: "We charge a 1% platform fee on every prediction to cover transaction fees (gas), 24/7 support, backend infrastructure, and sports money flow management"
- **Value proposition** — emphasize local events, home games, friends & family predictions, daily income potential, pool-sharing model

### Landing Page Visual Enhancements

**File: `src/pages/platform/LandingPage.tsx`** — full redesign:

1. **Floating Sport Icons** — CSS-animated emoji/icons (football, basketball, boxing glove, soccer, MMA octagon) orbiting behind the hero text with soft blue glow trails
2. **Gradient Mesh Background** — animated dark blue/purple/teal shifting gradient replacing flat #06080f
3. **Animated Stats Counter** — numbers tick up on scroll: "$1B+ Liquidity", "100+ Events", "24/7 Markets"
4. **Phone Mockup** — CSS-rendered phone frame in hero showing a mini preview of a branded operator app
5. **Scrolling Sports Ticker** — horizontal ribbon of sport names replacing static chips
6. **Glowing CTA Buttons** — pulse animation, stronger shadow, shimmer effect on "BUY NOW"
7. **Use Case Section** — NEW section: "Create events for your local teams. Share with friends and family. Everyone predicts, winners share the pool. Build your daily income."
8. **Subdomain Preview** — mock browser bar showing "fightnight.1mg.live" with a mini app preview
9. **Fee Transparency Section** — before bottom CTA: "Only 1% platform fee — we handle gas, support, backend, and all sports money flow"

### Updated Content

- FEATURES array updated to include "1% Platform Fee" card explaining what it covers
- STEPS updated: Step 1 now says "Pay $2,400 USDC on Polygon to unlock"
- "What You Get" list adds "Pool-based predictions — winners share the pool", "Create local events for home games", "Share with friends & family"
- Bottom CTA adds fee disclosure line

### Purchase Page

**File: `src/pages/platform/PurchasePage.tsx`** — new page:

1. **Pre-purchase disclosure card**:
   - "Platform Access — $2,400 USDC (one-time)"
   - "1% platform fee on every prediction"
   - "What's included: Gas fees covered, 24/7 support, complete backend, sports money flow, built-in liquidity"
   - Checkbox: "I understand the 1% platform fee on all predictions"
2. **USDC balance display** — uses existing `usePolygonUSDC` hook
3. **If balance < $2,400** — show "Add Funds" link
4. **If balance >= $2,400** — show "Confirm Purchase" button
5. **Payment execution**:
   - Uses `useSendTransaction` from `@privy-io/react-auth` with `sponsor: true`, `chainId: 137`
   - Encodes ERC-20 `transfer(treasury, 2400000000)` (2400 USDC = 2400 * 10^6)
   - Treasury: `0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d`
6. **After payment**:
   - Calls `operator-manage` with `action: "confirm_purchase"` + tx hash
   - Edge function verifies on Polygon RPC
   - Sets operator status to `active`
   - Redirects to onboarding

### Edge Function Update

**File: `supabase/functions/operator-manage/index.ts`** — add `confirm_purchase` action:

- Receives `{ action: "confirm_purchase", tx_hash }`
- Verifies on Polygon RPC via `eth_getTransactionReceipt`:
  - Status = 0x1
  - Transfer log to treasury >= 2400 USDC
  - USDC contract address matches
- Creates or updates operator row with `status = 'active'`
- Returns success

### Database Migration

**Add `status` column to `operators` table:**
```sql
ALTER TABLE public.operators 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
```
Values: `pending` (before payment), `active` (after payment verified).

### Route Updates

**File: `src/pages/platform/PlatformApp.tsx`**:
- Add `/purchase` route (protected)
- Update onboarding/dashboard guards to check operator `status = 'active'`

### Onboarding Fee Disclosure

**File: `src/pages/platform/OperatorOnboarding.tsx`**:
- Update fee step note from "Platform takes 2% base fee" to "Platform takes 1% fee on every prediction (covers gas, support, backend & money flow). Your fee is added on top."

### Files Changed

1. `src/pages/platform/LandingPage.tsx` — full visual redesign with premium elements + fee disclosure
2. `src/pages/platform/PurchasePage.tsx` — new purchase flow page
3. `src/pages/platform/PlatformApp.tsx` — add `/purchase` route
4. `src/pages/platform/OperatorOnboarding.tsx` — update fee disclosure text
5. `supabase/functions/operator-manage/index.ts` — add `confirm_purchase` action with on-chain verification
6. Database migration — add `status` column to `operators`

