
# Fix: Replace Lovable Preview URL with www.1mgaming.com in AI Win Share Card

## What's Wrong

The screenshot shows two places where the wrong URL appears when a user shares an AI victory on WhatsApp:

1. **The share message body** (all languages): Shows `https://one-million-spark.lovable.app` — this is the URL users send to friends
2. **The watermark at the bottom of the card image**: Shows `one-million-spark.lovable.app` — this is baked into the downloaded PNG

Both originate from a single constant in `src/components/AIWinShareCard.tsx` line 39:
```typescript
const SITE_URL = "https://one-million-spark.lovable.app";
```

And a hardcoded string on line 287:
```
one-million-spark.lovable.app
```

## Why Only One File Needs Changing

The i18n share templates in all 10 locales use `{{link}}` as a template variable:
- Hindi: `"मैंने 1M GAMING पर AI को हरा दिया! मुफ्त में खेलें: {{link}}"`
- All other languages follow the same pattern

So changing `SITE_URL` to `https://www.1mgaming.com` automatically fixes the share text in Arabic, Chinese, French, German, Hindi, Italian, Japanese, Portuguese, and Spanish — no i18n file changes needed.

All other files in the project already correctly use `https://1mgaming.com` (HelpCenter, HelpArticle, SeoMeta, MobileWalletRedirect, etc.). Only `AIWinShareCard.tsx` has the stale preview URL.

## Scope: One File, Two Lines

**File:** `src/components/AIWinShareCard.tsx`

| Line | Before | After |
|------|--------|-------|
| 39 | `const SITE_URL = "https://one-million-spark.lovable.app";` | `const SITE_URL = "https://www.1mgaming.com";` |
| 287 | `one-million-spark.lovable.app` | `www.1mgaming.com` |

## Result After Fix

- WhatsApp messages will share: `https://www.1mgaming.com`
- X (Twitter) tweet links will show: `https://www.1mgaming.com`
- The downloaded PNG card watermark will read: `www.1mgaming.com`
- All 10 language share templates automatically updated (no i18n changes needed)
- Works for all 5 AI game types: Chess, Checkers, Backgammon, Dominos, Ludo
