
## Fix buy-page button text alignment and replace yellow button halo with light blue

### Goal

Make the 1mg.live purchase buttons look polished on mobile and remove the unwanted yellow/gold glow under blue buttons. The blue buttons should have centered text/icons and a soft light-blue glow instead.

### What I will change

#### 1. Fix the buy-page bottom CTA button layout

File: `src/pages/platform/PurchasePage.tsx`

Update the main purchase/activation button so the text and arrow are centered cleanly on all screen sizes.

Current issue:
- The button inherits the default button styling.
- The text/icon can appear pushed toward the sides on narrow mobile screens.
- The blue button still inherits the global gold/yellow shadow.

Planned button styling:
- Full-width, centered content
- Proper `gap` between text and arrow/spinner
- No wrapping/side stretching
- Better mobile typography
- Light-blue shadow instead of yellow glow

Example style direction:

```tsx
className="
  w-full h-14
  inline-flex items-center justify-center gap-2
  px-4 text-base sm:text-lg text-center
  bg-blue-600 hover:bg-blue-500 text-white border-0
  rounded-xl
  shadow-[0_10px_34px_-10px_rgba(59,130,246,0.65)]
  hover:shadow-[0_14px_42px_-12px_rgba(96,165,250,0.75)]
"
```

The button content will also be wrapped so each state remains visually balanced:

```tsx
<span className="inline-flex items-center justify-center gap-2">
  Activate for Free <ArrowRight size={18} />
</span>
```

#### 2. Replace yellow/gold halo on 1mg.live blue buttons

Files to update:
- `src/pages/platform/PurchasePage.tsx`
- `src/pages/platform/OperatorPurchaseSuccess.tsx`
- `src/pages/platform/LandingPage.tsx`

The shared `Button` component’s default variant includes a gold shadow. When platform pages use:

```tsx
<Button className="bg-blue-600 ...">
```

the blue background changes, but the inherited default gold shadow can remain underneath.

I will override those platform blue buttons with explicit light-blue shadows so they no longer display yellow/gold glow.

Targets:
- Buy page main CTA
- Buy page “Apply” / secondary blue action where applicable
- Purchase success “Start Setup”
- 1mg.live landing page “Buy Now” CTA buttons
- 1mg.live sign-in blue button if it shows the same halo

#### 3. Keep gold glow only where it belongs

I will not remove gold styling globally from the whole app because other game areas intentionally use the Egyptian/gold theme.

Instead:
- Platform / 1mg.live blue buttons get blue glow.
- Operator Gold theme can still use gold accents.
- Non-platform game UI remains unchanged.

This follows the existing project rule: blue/red operator themes should not show gold glow; gold glow is exclusive to the Gold theme.

### Verification

After implementation, I will check:

1. Buy page on mobile width similar to the screenshot.
2. Bottom CTA text is centered inside the button.
3. Arrow/spinner sits next to the text, not pushed to the edge.
4. `Activate for Free`, `Retry Free Activation`, `Activating free access...`, and paid purchase states all look centered.
5. The halo beneath the buy-page CTA is light blue, not yellow.
6. 1mg.live landing CTA buttons use a light-blue glow.
7. Purchase success “Start Setup” button uses a light-blue glow.
8. No backend, payment, promo-code, wallet, or USDC logic is changed.

### Expected result

The buy page button will look clean and centered on mobile, and the 1mg.live blue buttons will have a premium light-blue glow instead of the current yellow/gold shading.
