

# HD Social Media Sharing with New Pyramid Logo

## What We're Doing
Adding your crisp HD pyramid logo as the image that appears when anyone shares 1MGaming.com on Instagram, X (Twitter), WhatsApp, or any social platform. Currently the preview is blurry because it uses a tiny app icon.

## Changes

### 1. Add the HD logo to the project
Copy your uploaded pyramid image to `public/images/og-logo.png` so social media crawlers can access it directly.

### 2. Update `index.html` meta tags
Replace the current blurry `og:image` with the new HD logo using absolute URLs (required by social platforms). Add Twitter/X large card support so previews are big and crisp instead of tiny thumbnails.

New tags:
- `og:image` -- absolute URL to HD logo
- `og:image:width` / `og:image:height` -- dimensions for platforms
- `og:site_name` -- "1M Gaming"
- `twitter:card` -- `summary_large_image` for large preview on X
- `twitter:image` -- same HD logo
- `twitter:title` / `twitter:description` -- brand messaging

### 3. Update `MatchShareCard.tsx` dynamic OG tags
When someone shares a match result link (`/match/:roomPda`), dynamically update the OG meta tags so the preview shows the 1M Gaming branding with match context.

## Files Changed

| File | Change |
|------|--------|
| `public/images/og-logo.png` | New -- HD pyramid logo copied from upload |
| `index.html` | Updated OG + Twitter Card meta tags with absolute URLs to HD image |
| `src/pages/MatchShareCard.tsx` | Add dynamic meta tag updates for match share links |

## Technical Details

### index.html meta tag updates (replacing lines 8-11):

```html
<meta property="og:title" content="1M Gaming | Premium Skill Gaming Platform" />
<meta property="og:description" content="Where strategy becomes WEALTH. Premium skill gaming platform on Solana." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://one-million-spark.lovable.app" />
<meta property="og:image" content="https://one-million-spark.lovable.app/images/og-logo.png" />
<meta property="og:image:width" content="1024" />
<meta property="og:image:height" content="1024" />
<meta property="og:site_name" content="1M Gaming" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="1M Gaming | Premium Skill Gaming Platform" />
<meta name="twitter:description" content="Where strategy becomes WEALTH. Skill-based gaming on Solana." />
<meta name="twitter:image" content="https://one-million-spark.lovable.app/images/og-logo.png" />
```

### MatchShareCard.tsx dynamic tags:

Add a `useEffect` that updates `og:title` to include match result context (e.g., "Victory - Backgammon | 1M Gaming") when the match data loads.

