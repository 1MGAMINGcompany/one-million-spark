

## Trackdesk Integration — Smallest Safe Patch

### Real flow (verified)
- 1mg.live runs the `PlatformApp` shell. Routes touched: `/` (`LandingPage`), `/buy-predictions-app` (`BuyPredictionsApp`), `/purchase` (`PurchasePage`).
- On successful `confirm_purchase` today, `PurchasePage` flips to `step="success"` and renders an inline success card with a "Start Setup" button. There is **no** dedicated success route yet.
- `index.html` is the single shared HTML for both 1mgaming.com and 1mg.live.

### Files changed (3 + 1 new)

1. **`index.html`** — add Trackdesk click script (cdn.trackdesk.com) inside `<head>`, guarded by hostname so it only runs on `1mg.live` / `www.1mg.live`. Single global include covers `/`, `/buy-predictions-app`, `/purchase` (SPA — script loads once on first page load).
2. **NEW `src/pages/platform/OperatorPurchaseSuccess.tsx`** — minimal success screen that:
   - Reads `purchase_tx_hash` (or generated id) and `amount` from `location.state` or query string.
   - Fires Trackdesk conversion script in a `useEffect` wrapped in try/catch (never throws).
   - Renders the same success UI currently inline in `PurchasePage` ("You're In!" + Start Setup CTA → `/onboarding`).
3. **`src/pages/platform/PlatformApp.tsx`** — add one route: `/operator-purchase-success` (no auth gate so a refreshed page still resolves; success is idempotent).
4. **`src/pages/platform/PurchasePage.tsx`** — on success branches (free-promo and paid), instead of `setStep("success")`, `navigate("/operator-purchase-success", { state: { txHash, amount: effectivePrice } })`. Keep all other logic identical.

### Trackdesk script placements

**Click script — `index.html` `<head>` (after the existing 1mg.live meta block, before charset is fine; standard pattern is end of `<head>`):**

```html
<script>
  (function(){
    var h=location.hostname;
    if(h!=='1mg.live'&&h!=='www.1mg.live')return;
    (function(t,d,k){
      (t[k]=t[k]||[]).push(d);
      var f=document.getElementsByTagName('script')[0],
          s=document.createElement('script');
      s.async=1;s.src='//cdn.trackdesk.com/tracking.js';
      f.parentNode.insertBefore(s,f);
    })(window,'1mg-live','TrackdeskObject');
  })();
</script>
```
*(`'1mg-live'` is the Trackdesk account/program slug — replace with the actual Trackdesk-issued identifier when known.)*

**Conversion script — only inside `OperatorPurchaseSuccess.tsx` `useEffect`:**

```ts
useEffect(() => {
  try {
    if (typeof window === "undefined") return;
    if (!/^(www\.)?1mg\.live$/i.test(location.hostname)) return;
    const td = (window as any).trackdesk;
    if (typeof td !== "function") return;
    td("1mg-live", "conversion", {
      conversionType: "sale",
      amount: { value: amount ?? 2400, currency: "USD" },
      externalId: txHash || `purchase_${Date.now()}`,
    });
  } catch (e) {
    console.warn("[Trackdesk] conversion fire failed (non-blocking)", e);
  }
}, [txHash, amount]);
```

### What does NOT change
Privy login, wallet creation, `/add-funds` funding, USDC.e Polygon payment, `verifyTxOnChain`, replay protection, `confirm_purchase` backend, operator creation, ownership binding (`user_id = privyDid`), payout wallet auto-fill, agreement v1.0, onboarding, public slug launch, operator referral attribution (`useOperatorReferralCapture` + `1mg_operator_ref`), settlement, sweep, trading.

### Risk check

| Risk | Mitigation |
|---|---|
| Trackdesk CDN blocked / fails to load | Conversion call wrapped in try/catch + `typeof td !== "function"` guard; never throws, never blocks UI |
| Conversion fires on flagship (1mgaming.com) | Hostname guards on both click and conversion scripts |
| Duplicate conversion on refresh | Acceptable — `externalId = purchase_tx_hash` lets Trackdesk dedupe server-side; idempotent by design |
| Success page deep-link with no state | Falls back to `externalId = purchase_${Date.now()}`; user still sees success UI; no purchase logic re-runs |
| Conversion fires on failed purchase | Impossible — page only reached via `navigate()` from success branch in `PurchasePage` |
| Click script breaks 1mgaming.com | Hostname guard returns early; zero effect on flagship |
| Operator referral collision (`1mg_operator_ref`) | Untouched — Trackdesk uses its own cookie; both attribution systems coexist |

### Test plan

1. **Click script load (1mg.live)**: visit `/`, DevTools Network → `tracking.js` from `cdn.trackdesk.com` loads. ✅
2. **Click script skipped (1mgaming.com)**: visit flagship → no Trackdesk request fires. ✅
3. **Affiliate link**: visit `/?aff=PARTNER01` → Trackdesk click registered (cookie set). ✅
4. **Successful purchase**: complete real or promo-free purchase → redirect to `/operator-purchase-success` → `trackdesk('1mg-live','conversion',...)` fires once with `externalId = txHash`, amount, currency=USD. ✅
5. **Failed purchase**: trigger a confirm_purchase error → stays on `step="error"`, no navigation, no conversion fired. ✅
6. **CDN blocked**: block `cdn.trackdesk.com` in DevTools → success page still renders, Start Setup button still navigates to `/onboarding`. ✅
7. **Free-promo path**: 100% promo code → redirect to success page → conversion fires with `amount.value = 0`. ✅
8. **Operator referral coexistence**: `/?ref=PARTNER01&aff=TRACKDESK01` → `1mg_operator_ref` set AND Trackdesk click registered; both flow through to confirm_purchase + success. ✅

