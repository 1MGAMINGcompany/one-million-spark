

## Plan: Show 1MG.live Logo in Navbar on 1mg.live Domain

### Problem
`BrandLogo.tsx` always renders the `PyramidLogo` SVG and "1M GAMING" text regardless of domain. On 1mg.live it should show the 1MG.live logo image instead.

### Changes

#### 1. Update BrandLogo to be domain-aware
**File:** `src/components/BrandLogo.tsx`

- Import `detectDomain` from `@/lib/domainDetection`
- Call `detectDomain()` to check if we're on `platform` or `operator` type
- If on 1mg.live (platform/operator): render an `<img src="/images/1mglive-logo.png">` and text "1MG.live" instead of `PyramidLogo` + "1M GAMING"
- Keep PyramidLogo + "1M GAMING" for flagship domain

### Files Changed
1. `src/components/BrandLogo.tsx` — add domain detection, conditionally render 1MG.live logo

