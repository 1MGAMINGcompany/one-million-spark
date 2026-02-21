

## Fix: PWA Build Failure Causing Stale Preview

### Problem

The build is timing out because `vite-plugin-pwa` with `globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']` is trying to precache all 8500+ generated JS and CSS asset chunks into the service worker manifest. This creates an enormous `sw.js` that exceeds the build size/time limit.

The "visitors today" counter is NOT broken in code — the network requests show correct data (`visitsToday: 329`, etc.). The counter disappeared because the build cannot complete, so the preview is stuck on a stale version.

### Fix

One change to `vite.config.ts`: remove `js` and `css` from the workbox `globPatterns` so only lightweight shell files (HTML, icons, manifest) are precached. JS/CSS will be cached at runtime via a `StaleWhileRevalidate` strategy instead.

### Technical Details

**File: `vite.config.ts`** (line 20)

Change:
```
globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
```
To:
```
globPatterns: ['**/*.{html,ico,png,svg,webmanifest}']
```

And add these to the existing `runtimeCaching` array:
- `navigateFallbackDenylist: [/^\/api/, /^\/~oauth/]` to prevent caching API/auth routes
- `maximumFileSizeToCacheInBytes: 3 * 1024 * 1024` as a safety limit
- A `StaleWhileRevalidate` runtime cache rule for `.js` and `.css` files (max 100 entries, 30-day expiry)

This is a single-file, 5-line change. Once the build succeeds, the visitors counter will reappear since the underlying data and component code are correct.

| File | Change |
|---|---|
| `vite.config.ts` | Remove js,css from globPatterns; add runtime caching + safety limits |

