
## Restore 1mg.live button color and keep light-blue glow

### Issue

The button component’s default style still includes the global gold/yellow `bg-primary` and `shadow-gold` utilities. The new `.platform-blue-button` class was added, but because it sits in a lower-priority CSS layer, the default yellow button background can still win in the browser.

That is why the 1mg.live buttons turned yellow even though the intended platform style is blue.

### Fix

#### 1. Make platform blue button override the global yellow button style

File: `src/index.css`

Update `.platform-blue-button` so it forcefully overrides the shared default button background/shadow:

```css
.platform-blue-button {
  background: #2563eb !important;
  color: #ffffff !important;
  border-color: transparent !important;
  box-shadow: 0 10px 34px -10px rgba(59, 130, 246, 0.65) !important;
}

.platform-blue-button:hover {
  background: #3b82f6 !important;
  box-shadow: 0 14px 42px -12px rgba(96, 165, 250, 0.75) !important;
}
```

This keeps:
- Button fill: 1mg.live blue
- Text: white
- Halo underneath: soft light blue
- No yellow/gold background or shadow on platform buttons

#### 2. Remove conflicting glow classes from 1mg.live buttons

File: `src/pages/platform/LandingPage.tsx`

Remove `btn-glow` from the main “Buy Now” buttons if it conflicts with the clean blue button style.

Keep the CTA button styling as:

```tsx
className="platform-blue-button text-lg px-10 h-16 border-0 rounded-xl font-bold ..."
```

The button can still have a premium light-blue shadow from `.platform-blue-button`, but not the yellow fill.

#### 3. Apply the same button treatment consistently

Confirm these buttons all use the corrected blue style:

- 1mg.live landing hero “Buy Now”
- 1mg.live final CTA “Buy Now”
- Sign-in button in the 1mg.live top nav
- Buy page main purchase / free activation button
- Buy page “Add Funds Now” button
- Purchase success “Start Setup” button

#### 4. Keep yellow/gold styling elsewhere

Do not change the shared `Button` component globally because the gaming side still uses gold/yellow as part of its theme.

Only platform-specific buttons should be corrected.

### Verification

After the change, verify:

1. 1mg.live landing buttons are blue, not yellow.
2. The glow/halo under the buttons is light blue.
3. The buy page CTA stays centered and blue.
4. The free-code, paid, and discounted purchase button states still look aligned.
5. No backend, wallet, promo-code, or payment logic is changed.

### Expected result

The 1mg.live buttons return to the previous blue brand color, with a refined light-blue glow underneath and no yellow/gold button styling on platform pages.
