

# SEO Page for 1mg.live — "Buy a Predictions App"

## Overview
Create a long-form SEO page at `/buy-predictions-app` on the 1mg.live platform, targeting search queries like "buy a predictions app", "white-label predictions platform", "start a predictions business". Add footer links on the LandingPage pointing to it.

## Changes

### 1. New page: `src/pages/platform/BuyPredictionsApp.tsx`
- Long-form SEO content page styled consistently with the dark 1mg.live theme
- H1: "Buy Your Own Predictions App"
- Sections: What you get, How it works, Who it's for, Sports & events covered, Pricing, FAQ
- Structured data: JSON-LD (Article + FAQPage) for Google rich results
- Meta tags via the existing `SeoMeta` component
- CTA buttons throughout linking to `/purchase` (or triggering Privy login)
- Footer matching the LandingPage footer style

### 2. Update `src/pages/platform/PlatformApp.tsx`
- Add route: `<Route path="/buy-predictions-app" element={<BuyPredictionsApp />} />`

### 3. Update `src/pages/platform/LandingPage.tsx` footer
- Add link: "Buy a Predictions App" pointing to `/buy-predictions-app`
- Keep existing links (Why Predictions Are Legal, Contact, Terms, Privacy)

### SEO targets
- Primary: "buy predictions app", "buy a predictions app"
- Secondary: "white label predictions platform", "start predictions business", "predictions app for sale", "sports predictions app"

