

## Plan: Event Date Fix, Auto-Claim Clarity, and Operator-Branded Sharing

### Problem Analysis

**1. Date categorization bug (lines 310-315 of FightPredictions.tsx)**
The current logic only moves events to "past" if they're >24h old AND on a different calendar day (line 312). A March 28th event viewed on March 29th morning is <24h old, so it falls through to line 315 where `hasOpenFights` keeps it in "TODAY". Fix: any event whose `event_date` calendar day is before today should go to "past", regardless of age or open fights.

**2. Claim behavior**
Auto-claim is already implemented (`prediction-auto-claim` edge function). The UI already states "Winnings are automatically sent to your wallet." The `handleClaim` button exists as a manual fallback. No backend changes needed — just ensure messaging is consistent.

**3. Operator-branded sharing**
`SocialShareModal` hardcodes "1MGAMING" logo, "1mgaming.com" URL, and "1MGAMING" text. When used from an operator app (`*.1mg.live`), it should show the operator's brand name, logo, and link to their subdomain.

---

### Changes

**File 1: `src/pages/FightPredictions.tsx`** — Fix date categorization

Replace the event categorization block (lines ~310-321) so that events whose `event_date` is on a previous calendar day are always categorized as "past", even if they have open fights:

```text
Current (buggy):
  line 312: if eventMs > 24h ago AND different day → past
  line 315: if hasOpenFights → today  ← THIS IS THE BUG

Fixed:
  NEW CHECK: if event_date's calendar day < today's calendar day → past
  Then: if hasOpenFights or same calendar day → today
```

**File 2: `src/components/SocialShareModal.tsx`** — Accept operator branding props

- Add optional props: `operatorBrandName`, `operatorLogoUrl`, `operatorSubdomain`
- When present, replace "1MGAMING" with operator brand name
- Replace pyramid logo with operator logo (fallback to pyramid)
- Change share URL from `1mgaming.com/predictions` to `{subdomain}.1mg.live`
- Update download filename to use operator brand

**File 3: `src/pages/platform/OperatorApp.tsx`** — Pass operator branding to share modal

- Pass `operator.brand_name`, `operator.logo_url`, and `operator.subdomain` through to `PredictionSuccessScreen` and `SocialShareModal`

**File 4: `src/components/predictions/PredictionSuccessScreen.tsx`** — Forward operator props

- Accept and forward `operatorBrandName`, `operatorLogoUrl`, `operatorSubdomain` to `SocialShareModal`

**File 5: `src/components/predictions/PredictionModal.tsx`** — Thread operator props through

- Accept and forward operator branding props to `PredictionSuccessScreen`

---

### Technical Details

**Date fix logic:**
```typescript
// Before the hasOpenFights check, add:
const eventDay = eventMs ? new Date(eventMs).toDateString() : null;
const isPastDay = eventDay != null && eventDay !== todayStr && eventMs! < nowMs;

// Then in the categorization:
} else if (isPastDay) {
  past.push([eventName, group]);
} else if (hasOpenFights || ...) {
  today.push([eventName, group]);
}
```

**Operator share URL:**
```typescript
function buildShareUrl(referralCode?: string, operatorSubdomain?: string): string {
  const base = operatorSubdomain
    ? `https://${operatorSubdomain}.1mg.live`
    : "https://1mgaming.com/predictions";
  if (referralCode) return `${base}?ref=${referralCode}`;
  return base;
}
```

**Auto-claim messaging:** Already correct in `PastEventsSection`. The claim button is a manual safety fallback — no changes needed.

