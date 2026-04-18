
The user is seeing "1M Gaming | Premium Predictions Platform" as the link preview when sharing `https://1mg.live/affiliate` on a messaging platform (looks like iMessage/WhatsApp link unfurl).

## Root cause

The `AffiliateProgram.tsx` page calls `useSeoMeta(...)` which sets the title/OG tags **client-side via useEffect**. But link unfurlers (iMessage, WhatsApp, Telegram, Slack, Twitter, Facebook) **do NOT execute JavaScript** — they only read the static HTML returned from the server.

The static `index.html` shipped to all routes contains the default 1M Gaming metadata:
- `<title>1M Gaming | Premium Predictions Platform</title>`
- `<meta property="og:title" content="1M Gaming...">` 

So every route on `1mg.live` (including `/affiliate` and `/buy-predictions-app`) gets the same fallback preview when shared, regardless of what `useSeoMeta` does at runtime.

This is the exact same class of issue we fixed for `/buy-predictions-app` — but that fix only updated the runtime `useSeoMeta` call, NOT the static HTML. So the social preview is still wrong there too. The user just noticed it on `/affiliate` first.

## Why the browser tab shows the right title but link previews don't

- Browser tab → React mounts → `useEffect` → `document.title` updates → ✅ correct
- Link unfurler → fetches HTML → reads `<title>` from raw HTML → never runs JS → ❌ shows 1M Gaming

## Fix options

**Option A — Domain-aware static HTML (smallest safe patch)**
Update `index.html` so the default static metadata is 1mg.live branded (since 1mg.live is the production platform domain). Flagship `1mgaming.com` keeps its title via `useSeoMeta` runtime — but we'd hit the inverse problem.

**Option B — Per-route static prerendering**
Requires SSR/SSG — too big, breaks the "small safe patch" rule.

**Option C — Inject route-aware OG tags via a tiny script in index.html before unfurl**
Doesn't work — unfurlers don't run JS.

**Option D — Use a dynamic OG image/meta service or edge function**
Overkill for this issue.

**Recommended: Option A, with nuance.**
Since `1mg.live` is the canonical platform shell and is the domain the user is sharing publicly, change the static `index.html` defaults to be neutral/1mg.live-branded. The `useSeoMeta` hook will still override correctly inside the SPA for both domains. Link previews will then show 1mg.live branding by default on both domains' raw HTML — which is acceptable because:
- `1mg.live` shares should show 1mg.live branding ✅
- `1mgaming.com` shares of specific deep links → flagship pages already call `useSeoMeta` for in-app, but link unfurls would show 1mg.live default. This is a tradeoff.

**Better refinement**: Make the default static HTML metadata generic enough to work for both — e.g. "1MG — Predictions Platform" — and make the `/affiliate` and `/buy-predictions-app` fixes by leaving as-is (since unfurlers won't see the runtime updates anyway, but the generic default is acceptable).

Actually, the cleanest minimal fix is just: update `index.html` to use 1mg.live branding as the default since that's the primary public marketing domain, and the flagship is mostly a logged-in app.

## Plan

### Files changed (1)

**`index.html`** — Update the default static metadata to be 1mg.live branded (since 1mg.live is the public marketing domain):
- `<title>` → `1MG.live — Launch Your Branded Sports Predictions App`
- `<meta name="description">` → 1mg.live operator app description
- `<meta property="og:title">` → 1MG.live tagline
- `<meta property="og:description">` → matches above
- `<meta property="og:image">` → `/images/operator-app-og.png` (the existing 1mg.live operator OG image)
- `<meta property="og:url">` → `https://1mg.live`
- `<meta name="twitter:title">`, `<meta name="twitter:description">`, `<meta name="twitter:image">` → matching values

This way:
- Sharing `https://1mg.live/affiliate` → unfurler reads static HTML → shows 1mg.live branding ✅
- Sharing `https://1mg.live/buy-predictions-app` → same ✅
- Sharing `https://1mg.live/` → 1mg.live branding ✅
- Inside the SPA, `useSeoMeta` still overrides per-route correctly for browser tabs and SEO crawlers that DO run JS (Google, Bing) ✅

### What is NOT changed
- No changes to `AffiliateProgram.tsx`, `BuyPredictionsApp.tsx`, `PlatformApp.tsx`
- No changes to routing, Privy, Trackdesk, checkout, operator logic
- No changes to `useSeoMeta` hook (still works at runtime)
- No changes to `1mgaming.com` route components (they keep using `useSeoMeta` for runtime)

### Caveat for the user
Link unfurlers (iMessage, WhatsApp, Slack, Twitter) cache previews aggressively — sometimes for **24–48 hours or longer**. After deploy:
1. The static HTML will be correct immediately
2. But existing previews in iMessage/WhatsApp may still show old 1M Gaming for hours/days
3. To force-refresh: use Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) and Twitter's Card Validator to scrape fresh
4. iMessage caches per-device; sometimes only fixed by clearing the URL preview cache or sharing in a new conversation

### Risk
- **Low**: Only static metadata defaults change. SPA runtime metadata behavior unchanged.
- **Side effect**: If a user shares a deep link on `1mgaming.com` that doesn't render its own component fast enough for a JS-capable crawler, the unfurler would show 1mg.live branding. Mitigation: 1mgaming.com is mostly auth-gated app routes, not heavily shared marketing pages.

### Test plan
1. Deploy
2. View page source of `https://1mg.live/affiliate` → confirm `<title>` and OG tags are 1mg.live branded
3. Use Facebook Sharing Debugger on `https://1mg.live/affiliate` → confirm preview shows 1mg.live + operator OG image
4. Use Twitter Card Validator → same
5. Browser tab on `/affiliate` still shows runtime title from `useSeoMeta` (1mg.live Affiliate Program | Earn $400 USDC...) ✅
6. Browser tab on `/buy-predictions-app` still shows correct runtime title ✅
7. Confirm `1mgaming.com` flagship app still loads, in-app SEO via `useSeoMeta` still works for crawlers
