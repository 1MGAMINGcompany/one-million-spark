

## Plan: 1MG.live Branding — Logo, Favicon, and Google SEO Meta

### What we're doing
1. Use the uploaded `1mglive-logo.png` as the favicon and brand icon for 1mg.live (browser tab, smartphone home screen, Google results)
2. Update SEO meta tags dynamically when on the 1mg.live domain
3. Write compelling Google descriptions for the platform

### Changes

**1. Copy logo to public directory**
- Copy `user-uploads://1mglive-logo.png` to `public/images/1mglive-logo.png`

**2. Update `src/components/seo/SeoMeta.tsx`**
- Detect domain context and use `https://1mg.live` as SITE_URL when on the platform domain
- Set `og:site_name` to "1MG.live" when on platform
- Set `og:image` to the 1mglive logo when on platform

**3. Update `index.html`**
- Add a small inline script that detects if hostname is `1mg.live` and dynamically swaps:
  - `<title>` to "1MG.live | Launch Your Own Predictions App"
  - Favicon link to `/images/1mglive-logo.png`
  - Meta description to a conversion-focused description
  - OG tags for 1mg.live

**4. Add `public/site-1mg.webmanifest`**
- A separate PWA manifest for 1mg.live with:
  - name: "1MG.live"
  - short_name: "1MG.live"
  - description: conversion-focused copy
  - icons pointing to the 1mglive logo
- The inline script in index.html will swap the manifest link when on 1mg.live

**5. Update `LandingPage.tsx`**
- Add `useSeoMeta()` call with platform-specific title and description:
  - Title: "1MG.live — Launch Your Own Predictions App in Minutes"
  - Description: "Start a sports predictions business with your own branded app. Built-in payments, live events, and instant payouts. No coding required. One-time $2,400 setup."

### Google Description Copy
- **Homepage**: "Start a sports predictions business with your own branded app. Built-in payments, live events, and instant payouts. No coding required."
- **OG title**: "1MG.live — Your Predictions App, Your Brand, Your Revenue"

### Files changed
1. `public/images/1mglive-logo.png` (new — copied from upload)
2. `index.html` — domain-aware inline script for title/favicon/meta swap
3. `src/components/seo/SeoMeta.tsx` — domain-aware SITE_URL and og:site_name
4. `src/pages/platform/LandingPage.tsx` — add useSeoMeta call
5. `public/site-1mg.webmanifest` (new — PWA manifest for 1mg.live)

