

## Plan: 1MG.live Logo Everywhere — Full Brand Consistency

### What's Already Working
The `index.html` inline script already swaps these for 1mg.live domains:
- Favicon → `/images/1mglive-logo.png`
- PWA manifest → `/site-1mg.webmanifest`
- Apple touch icon → `/images/1mglive-logo.png`
- App name → "1MG.live"

The `BrandLogo.tsx` navbar logo is already domain-aware. The `site-1mg.webmanifest` exists with correct icons.

### What's Missing
Several components have **hardcoded "1M Gaming"** text that users on 1mg.live will see — in notifications, share dialogs, install prompts, etc.

### Changes

#### 1. Make MobileAppPrompt domain-aware
**File:** `src/components/MobileAppPrompt.tsx`
- Import `detectDomain` and show "1MG.live" instead of generic text when on platform/operator domain

#### 2. Make NotificationToggle iOS dialog domain-aware
**File:** `src/components/NotificationToggle.tsx`
- Update the hardcoded default values referencing "1M Gaming" to dynamically use "1MG.live" when on the 1mg.live domain

#### 3. Make turn notifications domain-aware
**File:** `src/hooks/useTurnNotifications.ts`
- Change `"1M GAMING — Your Turn"` to use the correct brand name based on domain

#### 4. Make share/invite text domain-aware
**File:** `src/components/ReferralSection.tsx`
- Update share text from "1M Gaming" to correct brand
**File:** `src/pages/Room.tsx`
- Update rematch share text
**File:** `src/lib/invite.ts`
- Update invite message branding

#### 5. Make SeoMeta consistent (already partially done)
**File:** `src/components/seo/SeoMeta.tsx` — already handles `og:site_name`, no change needed

### Files Changed
1. `src/components/MobileAppPrompt.tsx` — domain-aware app name
2. `src/components/NotificationToggle.tsx` — domain-aware iOS install dialog text
3. `src/hooks/useTurnNotifications.ts` — domain-aware notification title
4. `src/components/ReferralSection.tsx` — domain-aware share text
5. `src/pages/Room.tsx` — domain-aware rematch share text
6. `src/lib/invite.ts` — domain-aware invite text

