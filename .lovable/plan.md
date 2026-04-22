

## Add round-trip nav between Operator App and Operator Dashboard

Two tiny additive UI changes. No auth, payout, checkout, or routing logic touched.

### Change 1: App → Dashboard (only visible to the owner)

**File:** `src/pages/platform/OperatorApp.tsx`

In the existing navbar (around line 917, right side, before `PlatformLanguageSwitcher`), add a "Dashboard" button that only renders if the signed-in Privy DID matches `operator.user_id`.

- Decode the Privy DID from the access token using the same `extractPrivyDid` JWT-payload helper already used in `PlatformApp.tsx` (copy the 6-line function locally — no shared module needed).
- Use a `useQuery` keyed on `["is_operator_owner", operator.id]` that returns `true`/`false`. Cached 60s.
- When `true`, render a small button: icon + label "Dashboard", styled with `theme.primary` to match the existing sign-in button. Clicking it calls `navigate("/dashboard")` via `react-router-dom`'s `useNavigate`.
- When `false` or not signed in: render nothing (existing UI unchanged for end-users).

### Change 2: Dashboard → App (in-tab navigation button)

**File:** `src/pages/platform/OperatorDashboard.tsx`

In the dashboard header (around lines 401–410, next to the existing "1mg.live/{slug} ↗" external link), add a primary-styled **"View App"** button that navigates in the same tab via `navigate(\`/${operator.subdomain}\`)`. Keep the existing external-link `<a target="_blank">` in place (some operators prefer the new-tab behavior — additive only).

Use the existing `Button` component with `size="sm"` and `ExternalLink` icon already imported. Label: `t("operator.dashboard.viewApp")` with English fallback `"View App"`.

### Files changed (exact)

| File | Change |
|---|---|
| `src/pages/platform/OperatorApp.tsx` | Add owner-only "Dashboard" button in navbar; add `extractPrivyDid` helper + ownership `useQuery` |
| `src/pages/platform/OperatorDashboard.tsx` | Add "View App" in-tab nav button next to existing external link in dashboard header |

### What is NOT touched
- `RequireActiveOperator` guard, Privy login flow, embedded wallet logic
- Checkout, purchase confirmation, treasury address, payouts, sweep, onboarding
- GoAffPro tracking, affiliate page, footer, Trackdesk removal
- Operator data model, RLS policies, `operators` table, settings
- All other operator app behavior for non-owner end-users (zero visual change)

### Risk

| Area | Risk | Mitigation |
|---|---|---|
| Privacy / leakage | None — button only renders when DID matches owner | Server-trusted user_id comparison, cached query |
| Performance | Negligible — one cached lookup per app load | 60s `staleTime`, `enabled` only when authenticated |
| Mobile layout | Button is small icon+label, fits existing 833px navbar | Tested visually against current viewport |
| i18n | New `operator.dashboard.viewApp` and `operator.app.dashboardCta` keys with EN fallbacks | Falls back gracefully if translation missing |

### Test plan

1. Sign in as operator owner on `1mg.live/{your-slug}` → confirm "Dashboard" button appears in navbar
2. Click it → lands on `/dashboard` in the same tab
3. On `/dashboard` → click new "View App" button → lands on `/{slug}` in the same tab (operator app)
4. Sign in as a different (non-owner) Privy user on the same `1mg.live/{slug}` → confirm "Dashboard" button does NOT appear
5. Sign out → confirm only the "Sign In" button shows (existing behavior unchanged)
6. Confirm existing external-link `1mg.live/{slug} ↗` still opens in a new tab from the dashboard

