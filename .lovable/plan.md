

## Fix: Requote Banner Not Appearing on Price Slippage

### Problem
When the backend returns `price_changed_requote_required` (409), the frontend shows a generic toast ("Prediction failed / Odds have changed") instead of the interactive amber requote banner inside the modal.

### Root Cause
In `src/pages/platform/OperatorApp.tsx` line 1119, the `onSubmit` callback is:
```js
onSubmit={(amt) => { setRequoteData(null); handleSubmit(amt); }}
```
This clears `requoteData` before every submission — fine for the first call. But there's a subtle issue: `handleSubmit` is async and sets `requoteData` via `setRequoteData(...)` at line 541. Because React batches state updates, the `setRequoteData(null)` from the `onSubmit` wrapper and the `setRequoteData({...})` from the error handler may conflict if they run in the same render cycle.

Additionally, the `throw new Error(msg)` at line 562 acts as a fallback for any unrecognized `errorCode`. If `data.error_code` is somehow not parsed (empty string), the code falls through to the throw, which lands in the catch block at line 582 and shows the generic toast.

### Fix (2 changes, 1 file)

**File: `src/pages/platform/OperatorApp.tsx`**

1. **Remove premature `setRequoteData(null)` from onSubmit wrapper** (line 1119) — move it inside `handleSubmit` only after confirming it's not a requote response:
   ```js
   onSubmit={(amt) => handleSubmit(amt)}
   ```

2. **Add defensive logging** in the error handler to trace exactly what `data` contains when `errorCode` is empty — this will confirm whether the JSON body is being parsed correctly on 409 responses.

3. **Move the requote-data clear** into `handleSubmit` itself, right before the fetch call, so it only clears when a fresh submission starts (not when the modal's onSubmit fires).

### Secondary: Hide Finished Games
The MLB Pirates game you mentioned was already over. As a separate fix, the frontend should filter out events where `status = 'settled'` or `status = 'cancelled'` or `polymarket_active = false` to prevent users from opening tickets on dead markets.

### Files Changed
- `src/pages/platform/OperatorApp.tsx` — fix onSubmit requote-data clearing, ensure requote banner displays

### Test After Fix
1. Open a live MLB game on 1mg.live/demo
2. Wait a few seconds for price to potentially move
3. Place a $1 prediction
4. If price moved >3%, the amber "Odds Changed" banner should appear inside the modal (not a toast)
5. Click "Accept New Odds & Submit" — trade should go through

