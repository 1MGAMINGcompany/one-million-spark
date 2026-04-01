

## 1mg.live Growth & Conversion — 10 Improvements Build

All changes target the operator ecosystem only. No modifications to 1mgaming.com advanced UX.

---

### 1. Share Buttons on Operator App (Virality)

**Files:** `SimplePredictionModal.tsx`, `OperatorApp.tsx`

- **Success screen**: Replace "Done" as primary. Add "SHARE YOUR PICK" button (styled with `themeColor`) that opens `SocialShareModal` with `variant="prediction"`. "Done" becomes secondary text link below.
- **Win claim screen** (`SimplePredictionCard.tsx`): After "Collect Winnings" succeeds, show "SHARE YOUR WIN" button opening `SocialShareModal` with `variant="claim_win"`.
- Pass `operatorBrandName`, `operatorLogoUrl`, `operatorSubdomain` from `OperatorApp.tsx` down through card and modal props.
- Add `SocialShareModal` state (`shareOpen`, `shareVariant`, `shareFight`) to `OperatorApp.tsx`.

### 2. Auto-Populate Events on Operator Launch

**File:** `OperatorOnboarding.tsx`

- After successful operator creation (final step submit), call `prediction-admin` edge function with a new `seedOperatorEvents` action.
- Backend: In `prediction-admin/index.ts`, add `seedOperatorEvents` action that copies up to 5 upcoming platform events matching the operator's `allowed_sports` into their view (no duplication needed — they already see platform events via the `.or()` query). Instead, auto-set `status = "active"` on the operator record so events appear immediately.
- Actually, re-reading the code: operators already see platform events. The real fix is to ensure the operator's `allowed_sports` match popular sports and the onboarding completion navigates to the app immediately. Add a "Your app is ready!" success screen with a direct link to `{subdomain}.1mg.live`.

### 3. Event Date/Time on SimplePredictionCard

**File:** `SimplePredictionCard.tsx`

- Add `event_date` display below the team names row, using `formatEventDateTime` from `src/lib/formatEventLocalDateTime.ts`.
- Show as: `"Mar 15, 2:00 PM EDT"` in `text-xs text-white/30`.
- Also show league name from `fight.event_name` as a small badge above the card.

### 4. Draw Button for 3-Way Markets

**Files:** `SimplePredictionCard.tsx`, `SimplePredictionModal.tsx`, `OperatorApp.tsx`

- Check `fight.fighter_b_name` for "Draw" or check if fight has `price_draw` / third outcome field.
- Actually, 3-way markets have `fighter_a` and `fighter_b` as the two teams, with Draw as a separate concept. Check the Fight type for draw support.
- For fights where a draw outcome exists (detected via `fight.draw_enabled` or similar field), add a third button in the card grid: `grid-cols-3` instead of `grid-cols-2`. The draw button calls `onPredict(fight, "draw")`.
- Update `onPredict` handler type to accept `"fighter_a" | "fighter_b" | "draw"`.

### 5. Revenue Calculator on Landing Page

**File:** `LandingPage.tsx`

- Add a new section between hero and "How It Works".
- Three sliders: Users (10-1000, default 100), Avg bet/week ($5-$100, default $20), Fee % (1-10, default 5).
- Live calculation: `users * avgBet * (feePercent / 100)` displayed as weekly/monthly/yearly.
- Headline: "See How Much You Could Earn"
- Large animated result: `$400/week → $1,600/month → $20,800/year`

### 6. Single CTA + Price in Hero

**File:** `LandingPage.tsx`

- Remove the two-button CTA (BUY NOW + CREATE ACCOUNT).
- Replace with ONE button: `BUY NOW — $2,400 USDC` with `btn-glow` class.
- Below button, add trust text:
  ```
  When you continue, a secure wallet is created for you.
  This wallet is used to:
  ✅ pay for your app
  ✅ collect your earnings
  ✅ manage your business
  ```
- Add "View Live Demo" link below trust text → `https://demo.1mg.live`
- Apply same pattern to final CTA section at bottom.

### 7. "My Predictions" Tab

**File:** `OperatorApp.tsx`

- Add a tab bar below the navbar: "Events" | "My Picks" (only visible when authenticated).
- "My Picks" tab filters `allFights` to only those with a matching `userEntry`, showing the card in its "already picked" or "settled" state.
- Simple toggle state, no new page needed.

### 8. Fix "You Win" → Multiplier Display

**Files:** `SimplePredictionCard.tsx`, `SimplePredictionModal.tsx`

- **Card**: Change `You win: $18.20` → `Bet $10 → Win $18.20` (keeps the $10 reference amount).
- **Modal payout section**: Change `You Win: $18.20` → `Bet $10 → Win $18.20` using actual entered amount.
- Multiplier shown as small text: `(1.82x)` next to the payout.

### 9. Balance Display + "Add Funds" Nudge

**File:** `OperatorApp.tsx`, new component `OperatorBalanceBanner.tsx`

- When user is connected, show USDC.e balance in the navbar (already have `usePolygonUSDC` imported).
- If balance < $5, show a subtle banner below navbar: "Add funds to place predictions" with a link/button that opens the Add Funds flow or shows instructions.
- Use `relayer_allowance` or a direct balance check.

### 10. Collapse Sport Filters on Mobile

**File:** `OperatorApp.tsx`

- On mobile (`useIsMobile()`), replace the horizontal `ScrollableSportTabs` with a dropdown select.
- Show current sport + count as the trigger. Opens a sheet/dropdown with all sport options.
- Desktop keeps the current scrollable tabs.

---

### Implementation Order
1. Landing page hero fix (single button + trust text + demo link) — highest sales impact
2. Revenue calculator section
3. Fix "You win" → "Bet $X → Win $Y" on cards and modal
4. Add event date/time to cards
5. Share buttons (success screen + win claim)
6. Draw button for 3-way markets
7. "My Picks" tab
8. Balance display + add funds nudge
9. Mobile sport filter dropdown
10. Onboarding success screen with "Your app is ready" + direct link

**Files to modify:**
- `src/pages/platform/LandingPage.tsx`
- `src/components/operator/SimplePredictionCard.tsx`
- `src/components/operator/SimplePredictionModal.tsx`
- `src/pages/platform/OperatorApp.tsx`
- `src/pages/platform/OperatorOnboarding.tsx`

