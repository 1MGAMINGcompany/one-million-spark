
## Audit Findings

**Current real flow confirmed:**
- Success page: `src/pages/platform/OperatorPurchaseSuccess.tsx` (route `/operator-purchase-success`)
- Already fires Trackdesk conversion in a `useEffect`, hostname-guarded to `1mg.live` / `www.1mg.live`, with `try/catch`, using `txHash` + `amount`
- Trackdesk loader is in `index.html` inside an existing hostname-guarded IIFE block

**Affiliate page route:** `/affiliate` (with `/affiliates` redirect alias) → `src/pages/platform/AffiliateProgram.tsx`. Currently a static marketing page with a `mailto:` CTA. This is the page we will later redirect to GoAffPro's portal.

**No conflicts:** GoAffPro's loader is independent from Trackdesk; both can coexist on `window`.

---

## The Patch (smallest safe, additive)

### File 1: `index.html` — add GoAffPro loader (1mg.live only)

Add a new IIFE next to the existing Trackdesk block (inside `<head>`, after the Trackdesk script). Same hostname guard pattern:

```html
<!-- GoAffPro affiliate tracking — 1mg.live only -->
<script>
  (function(){
    var h=location.hostname;
    if(h!=='1mg.live'&&h!=='www.1mg.live')return;
    var s=document.createElement('script');
    s.async=1;
    s.src='https://api.goaffpro.com/loader.js?shop=pfiwnywrwo';
    var f=document.getElementsByTagName('script')[0];
    f.parentNode.insertBefore(s,f);
  })();
</script>
```

Why: matches existing Trackdesk pattern exactly. Async, non-blocking, never loads on `1mgaming.com` or preview/sandbox domains.

### File 2: `src/pages/platform/OperatorPurchaseSuccess.tsx` — fire GoAffPro conversion

Add a second `useEffect` (alongside the existing Trackdesk one, do not modify Trackdesk):

```tsx
// Fire GoAffPro conversion — best-effort, never blocks UI
useEffect(() => {
  try {
    if (typeof window === "undefined") return;
    if (!/^(www\.)?1mg\.live$/i.test(window.location.hostname)) return;

    const w = window as any;
    const orderNumber = txHash || `purchase_${Date.now()}`;
    const orderTotal = typeof amount === "number" ? amount : 2400;

    w.goaffpro_order = {
      number: orderNumber,
      total: orderTotal,
      // currency intentionally omitted — GoAffPro defaults to shop currency
    };

    // GoAffPro auto-detects window.goaffpro_order on script load.
    // If loader has already initialized, manually trigger conversion fire.
    if (typeof w.goaffpro === "object" && typeof w.goaffpro.conversion === "function") {
      w.goaffpro.conversion(w.goaffpro_order);
    }
  } catch (e) {
    console.warn("[GoAffPro] conversion fire failed (non-blocking)", e);
  }
}, [txHash, amount]);
```

**Order data mapping (per spec):**
- `number` = `purchase_tx_hash` if present, else stable fallback `purchase_${Date.now()}`
- `total` = real `amount` from location state / query string → `2400` full-price, discounted value for partial promo, `0` for free promo (already handled by existing amount derivation)

### Files NOT touched
- `PurchasePage.tsx`, `confirm-purchase` flow, Privy login, wallet creation/funding, operator ownership, payout wallet, onboarding, purchase verification — all untouched
- Trackdesk loader and conversion fire — untouched (coexist during testing)
- `1mgaming.com` routes — untouched (hostname guard blocks both loader and conversion)

---

## Affiliate Page Redirect — Where It Will Go

**Location identified:** `src/pages/platform/PlatformApp.tsx`, lines 101–102.

When you provide the GoAffPro affiliate portal URL, the swap is a one-line change. The `/affiliate` route currently renders `<AffiliateProgram />`. We will replace it with a tiny redirect component (e.g.):

```tsx
<Route path="/affiliate" element={<ExternalRedirect to="https://YOUR-GOAFFPRO-PORTAL-URL" />} />
<Route path="/affiliates" element={<ExternalRedirect to="https://YOUR-GOAFFPRO-PORTAL-URL" />} />
```

`AffiliateProgram.tsx` will be left in the codebase (not deleted) so we can roll back instantly by reverting the route element. **Not part of this patch** — wait for the URL.

---

## Risk Check

| Area | Risk | Mitigation |
|---|---|---|
| Purchase flow | None — no changes to checkout, Privy, wallet, confirm | N/A |
| UI blocking | None — try/catch wraps GoAffPro call | Failures log to console only |
| 1mgaming.com pollution | None — hostname guard on loader + conversion | Verified pattern matches existing Trackdesk guard |
| Trackdesk regression | None — Trackdesk code path unmodified | Both fire independently |
| Double-fire on remount | Low — `useEffect` deps `[txHash, amount]`, stable values | GoAffPro typically dedupes by order number; fallback ID uses `Date.now()` only when no txHash, which is rare |
| Loader not yet initialized when conversion fires | Handled — we set `window.goaffpro_order` regardless, and GoAffPro's loader picks it up on init | Plus we call `goaffpro.conversion()` if already loaded |

---

## Test Plan

1. **Loader presence on 1mg.live**: Open `https://1mg.live/`, DevTools → Network → confirm `loader.js?shop=pfiwnywrwo` loads. Console: `typeof window.goaffpro` should become `"object"`.
2. **Loader absent on 1mgaming.com**: Open `https://1mgaming.com/`, confirm no `goaffpro` request, `window.goaffpro` is `undefined`.
3. **Loader absent on preview**: Open Lovable preview URL, confirm no GoAffPro network request.
4. **Full-price conversion**: Complete a real $2400 purchase → land on `/operator-purchase-success` → DevTools console: inspect `window.goaffpro_order` → should be `{ number: "<txHash>", total: 2400 }`. Check GoAffPro dashboard for the conversion within ~60s.
5. **Discounted promo**: Complete a partial-promo purchase → confirm `total` reflects discounted amount (not 2400).
6. **Free promo (100% off)**: Complete free purchase → confirm `total: 0` is sent.
7. **Trackdesk still works**: Same purchase flow → Trackdesk dashboard still records the conversion. Both systems coexist.
8. **No txHash fallback**: Force a state-loss refresh on `/operator-purchase-success` without `?tx=` → confirm `number` falls back to `purchase_<timestamp>`, no crash.
9. **Network failure**: Block `api.goaffpro.com` in DevTools → page still renders, "Start Setup" button works, console shows the warn but no error.

---

## Summary of Files Changed

| File | Change |
|---|---|
| `index.html` | Add GoAffPro loader IIFE (hostname-guarded), inside `<head>` after Trackdesk block |
| `src/pages/platform/OperatorPurchaseSuccess.tsx` | Add second `useEffect` to set `window.goaffpro_order` and fire conversion (try/catch, hostname-guarded) |

**Total: 2 files, additive only. Trackdesk untouched. No backend, no routing, no checkout, no auth changes.**
